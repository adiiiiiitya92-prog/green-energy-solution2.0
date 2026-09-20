import Tesseract from 'tesseract.js';

/**
 * Multi-Engine AI & OCR Service for Automatic Aadhar & Pallet Scanning
 * Engine 1: Google Gemini Vision AI (Gemini 3.6 Flash / 3.7 Flash Multimodal Models)
 * Engine 2: Groq Vision AI (Qwen / LLaMA Vision Models)
 * Engine 3: Local Client-Side OCR (Tesseract.js Engine with Pattern Recognition)
 */

const GROQ_API_KEY =
  (import.meta as any).env?.VITE_GROQ_API_KEY || '';

const GEMINI_API_KEY =
  (import.meta as any).env?.VITE_GEMINI_API_KEY || '';

/**
 * Robust JSON parser handling raw JSON or markdown-wrapped JSON code blocks
 */
function parseJsonSafely(text: string): any {
  if (!text) return null;
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.slice(7);
  } else if (clean.startsWith('```')) {
    clean = clean.slice(3);
  }
  if (clean.endsWith('```')) {
    clean = clean.slice(0, -3);
  }
  clean = clean.trim();
  try {
    return JSON.parse(clean);
  } catch {
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Converts any File, Blob, or URL into a clean Base64 data URL
 */
async function fileOrUrlToBase64(input: File | Blob | string): Promise<string> {
  if (typeof input === 'string') {
    if (input.startsWith('data:')) return input;
    try {
      const res = await fetch(input);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('Failed to fetch image for OCR:', err);
      return '';
    }
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(input);
  });
}

/**
 * Resizes and optimizes high-resolution phone/camera photos before sending to AI Vision APIs
 * Prevents 503 "model overloaded" and payload size rejection while preserving crisp text OCR
 */
async function optimizeImageForVision(input: File | Blob | string, maxDimension = 1800): Promise<string> {
  let dataUrl = '';
  if (typeof input === 'string' && input.startsWith('data:')) {
    dataUrl = input;
  } else {
    dataUrl = await fileOrUrlToBase64(input);
  }
  if (!dataUrl) return '';

  // In non-browser environments (tests) return dataUrl directly
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrl;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // If already within reasonable dimensions and size is small (< 2MB)
      if (width <= maxDimension && height <= maxDimension && dataUrl.length < 2 * 1024 * 1024) {
        return resolve(dataUrl);
      }

      if (width > height) {
        if (width > maxDimension) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        }
      } else {
        if (height > maxDimension) {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);

        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.88);
        console.log(`🖼️ Optimized image for AI Vision: ${img.naturalWidth}x${img.naturalHeight} -> ${width}x${height} (${Math.round(compressed.length / 1024)} KB)`);
        resolve(compressed);
      } catch (err) {
        console.warn('Canvas optimization failed, using original:', err);
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Cleans and formats raw extracted text into "XXXX XXXX XXXX" Aadhar format
 */
export function cleanAadharNumber(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');

  // Exact 12 digits
  if (digits.length === 12) {
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
  }

  // Contains 12-digit sequence
  const match = digits.match(/[2-9]\d{11}/) || digits.match(/\d{12}/);
  if (match) {
    const d = match[0];
    return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)}`;
  }

  // 3 chunks of 4 digits in text
  const chunkMatch = raw.match(/\b\d{4}\s+\d{4}\s+\d{4}\b/);
  if (chunkMatch) {
    const clean = chunkMatch[0].replace(/\s+/g, '');
    return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)}`;
  }

  return '';
}

/**
 * Local Client-Side Tesseract OCR Scanner
 */
export async function extractAadharNumberLocalOCR(
  imageSource: File | Blob | string
): Promise<string> {
  try {
    console.log('🔍 Running Local High-Speed OCR on Aadhar image...');
    const result = await Tesseract.recognize(imageSource, 'eng', {
      logger: () => {}
    });

    const text = result.data.text || '';
    console.log('📄 OCR Raw Extracted Text:', text);

    // 1. Direct regex match on text for XXXX XXXX XXXX or XXXXXXXXXXXX
    const cleanNum = cleanAadharNumber(text);
    if (cleanNum) {
      return cleanNum;
    }

    // 2. Tokenized search for 3 consecutive 4-digit blocks
    const lines = text.split('\n');
    for (const line of lines) {
      const match = line.match(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/);
      if (match) {
        const d = match[0].replace(/[\s-]/g, '');
        if (d.length === 12) {
          return `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8, 12)}`;
        }
      }
    }
  } catch (err) {
    console.warn('Local OCR engine note:', err);
  }
  return '';
}

/**
 * Gemini Vision AI OCR Scanner for Aadhar
 */
export async function extractAadharNumberGeminiAI(
  base64DataUrl: string
): Promise<string> {
  if (!GEMINI_API_KEY || !base64DataUrl) return '';

  const mimeType = base64DataUrl.match(/data:([^;]+);base64,/)?.[1] || 'image/jpeg';
  const base64Data = base64DataUrl.replace(/^data:[^;]+;base64,/, '');

  const prompt = `You are an expert Indian Document OCR specialist. Look at this Aadhar card image and extract the 12-digit Aadhar number.
The Aadhar number is a 12-digit number (usually formatted in 3 groups of 4 digits, e.g. 1234 5678 9012 or 123456789012).
Return your response ONLY as valid JSON in this exact structure:
{
  "aadharNumber": "1234 5678 9012"
}
If no Aadhar number is detected or visible, return:
{
  "aadharNumber": ""
}`;

  const geminiModels = ['gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];

  for (const model of geminiModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        }
      );

      if (!response.ok) continue;

      const data = await response.json();
      const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsed = parseJsonSafely(contentText);
      const cleaned = cleanAadharNumber(parsed?.aadharNumber || contentText);
      if (cleaned) {
        return cleaned;
      }
    } catch (_) {
      // Try next model
    }
  }

  return '';
}

/**
 * Groq Vision AI OCR Scanner
 */
export async function extractAadharNumberGroqAI(
  base64DataUrl: string
): Promise<string> {
  if (!GROQ_API_KEY || !base64DataUrl) return '';

  const prompt = `You are an expert Indian Document OCR specialist. Look at this Aadhar card image and extract the 12-digit Aadhar number.
The Aadhar number is a 12-digit number (usually formatted in 3 groups of 4 digits, e.g. 1234 5678 9012 or 123456789012).
Return your response ONLY as valid JSON in this exact structure:
{
  "aadharNumber": "1234 5678 9012"
}
If no Aadhar number is detected or visible, return:
{
  "aadharNumber": ""
}`;

  const visionModels = [
    'qwen/qwen3.8-27b',
    'qwen/qwen3.6-27b'
  ];

  for (const model of visionModels) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: base64DataUrl } }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 150
        })
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      const contentStr = data.choices?.[0]?.message?.content || '{}';
      console.log(`🤖 Groq Vision AI Output (${model}):`, contentStr);

      const parsed = parseJsonSafely(contentStr) || {};
      const cleaned = cleanAadharNumber(parsed.aadharNumber || contentStr);
      if (cleaned) {
        return cleaned;
      }
    } catch (_) {
      // Try next model
    }
  }

  return '';
}

/**
 * Master Extraction Function (Runs Gemini AI, Groq AI & Local OCR in Parallel for 100% Success)
 */
export async function extractAadharNumberWithAI(
  imageSource: File | Blob | string
): Promise<{ aadharNumber: string; source: 'gemini' | 'groq' | 'local_ocr' | 'none'; success: boolean }> {
  try {
    const base64DataUrl = await fileOrUrlToBase64(imageSource);
    if (!base64DataUrl) {
      return { aadharNumber: '', source: 'none', success: false };
    }

    // Launch Gemini, Groq, and Local OCR in parallel
    const geminiPromise = extractAadharNumberGeminiAI(base64DataUrl);
    const groqPromise = extractAadharNumberGroqAI(base64DataUrl);
    const localOcrPromise = extractAadharNumberLocalOCR(base64DataUrl);

    // Wait for the fastest successful cloud result
    const fastCloudResult = await Promise.race([
      geminiPromise.then(res => res ? { num: res, src: 'gemini' as const } : null),
      groqPromise.then(res => res ? { num: res, src: 'groq' as const } : null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
    ]);

    if (fastCloudResult) {
      console.log(`✨ Aadhar extracted via ${fastCloudResult.src}:`, fastCloudResult.num);
      return { aadharNumber: fastCloudResult.num, source: fastCloudResult.src, success: true };
    }

    // Check Gemini first
    const geminiResult = await geminiPromise;
    if (geminiResult) {
      return { aadharNumber: geminiResult, source: 'gemini', success: true };
    }

    // Check Groq
    const groqResult = await groqPromise;
    if (groqResult) {
      return { aadharNumber: groqResult, source: 'groq', success: true };
    }

    // If cloud was slow or failed, check local OCR result
    const localResult = await localOcrPromise;
    if (localResult) {
      console.log('✨ Aadhar extracted via Local OCR:', localResult);
      return { aadharNumber: localResult, source: 'local_ocr', success: true };
    }

    return { aadharNumber: '', source: 'none', success: false };
  } catch (err: any) {
    console.error('Multi-engine Aadhar extraction error:', err);
    return { aadharNumber: '', source: 'none', success: false };
  }
}

/**
 * Pallet & Serial Number Scan Result Interface
 */
export interface PalletScanResult {
  brand?: string;
  model?: string;
  wattage?: number;
  category: 'solar_panel' | 'inverter' | 'battery' | 'structure' | 'other';
  suggestedName: string;
  palletNumber?: string;
  batchDate?: string;
  quantity: number;
  serialNumbers: string[];
  rawNotes?: string;
  success: boolean;
  error?: string;
}

/**
 * Extract Pallet, Model, and all Serial Numbers from Box / Pallet Label image using Google Gemini Vision AI
 */
export async function extractPalletDetailsGeminiAI(
  base64DataUrl: string
): Promise<PalletScanResult> {
  if (!GEMINI_API_KEY || !base64DataUrl) {
    return {
      category: 'solar_panel',
      suggestedName: '',
      quantity: 0,
      serialNumbers: [],
      success: false,
      error: 'Gemini API Key or Image source missing'
    };
  }

  const mimeType = base64DataUrl.match(/data:([^;]+);base64,/)?.[1] || 'image/jpeg';
  const base64Data = base64DataUrl.replace(/^data:[^;]+;base64,/, '');

  const prompt = `You are an expert Solar & Electrical equipment warehouse logistics OCR specialist.
Examine this solar panel / inverter / equipment pallet packing slip or box label image very carefully.
Extract the following details:
1. brand: Manufacturer / Brand name (e.g. Waaree, Vikram Solar, Goldi, Adani, Tata, Growatt, Solis, etc. Look at the OA no, label, model, or text).
2. model: The exact model number (e.g. BI-55-540-EVEP-10-MC4-0300-33-PTG-DCR-EC).
3. wattage: Extract panel wattage number if visible in model or text (e.g. 540 from BI-55-540).
4. category: Product category, choose one of: "solar_panel", "inverter", "battery", "structure", "other".
5. quantity: Total number of modules/items (e.g. 33).
6. palletNumber: Pallet/box number or large barcode number (e.g. 18126426871).
7. batchDate: Date on label if visible (e.g. 21-May-2026).
8. rawNotes: Any OA number, remarks, labelling notes (e.g. "OA: WAAREE-KM, Remarks: J-10-200-400-33").
9. serialNumbers: An array of ALL individual product serial numbers listed in the table or grid (e.g. WS05269070984561, etc.). Be extremely thorough and extract every single serial number present in the table without skipping any.

Return your response ONLY as valid JSON in this exact structure:
{
  "brand": "Waaree",
  "model": "BI-55-540-EVEP-10-MC4-0300-33-PTG-DCR-EC",
  "wattage": 540,
  "category": "solar_panel",
  "quantity": 33,
  "palletNumber": "18126426871",
  "batchDate": "21-May-2026",
  "rawNotes": "OA: WAAREE-KM, Remarks: J-10-200-400-33",
  "serialNumbers": ["WS05269070984561", "WS05269070910064"]
}`;

  const geminiModels = [
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3-flash-preview',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.7-flash'
  ];

  for (const model of geminiModels) {
    try {
      console.log(`🔍 Gemini Vision AI scanning pallet label with model ${model}...`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType,
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        }
      );

      if (response.status === 503) {
        const errText = await response.text();
        console.warn(`Gemini model ${model} temporarily unavailable (503), switching to next model...`, errText.slice(0, 100));
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }

      if (response.status === 429) {
        console.warn(`Gemini model ${model} rate limited (429), trying next model...`);
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Gemini model ${model} responded with ${response.status}:`, errText);
        continue;
      }

      const data = await response.json();
      const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`🤖 Gemini Pallet AI Output (${model}):`, contentText.slice(0, 300) + '...');

      const parsed = parseJsonSafely(contentText);
      if (!parsed) {
        console.warn(`Failed to parse Gemini output as JSON for ${model}`);
        continue;
      }

      // Clean and normalize serial numbers
      const rawSerials = Array.isArray(parsed.serialNumbers)
        ? parsed.serialNumbers
        : Array.isArray(parsed.serial_numbers)
        ? parsed.serial_numbers
        : [];

      const cleanSerials: string[] = rawSerials
        .map((s: any) => String(s || '').trim().replace(/[,;]+$/, ''))
        .filter((s: string) => s.length >= 4 && !s.toLowerCase().includes('total'));

      // Deduplicate serials while preserving order
      const uniqueSerials = Array.from(new Set(cleanSerials));

      const brand = (parsed.brand || parsed.brand_manufacturer || '').trim();
      const modelName = (parsed.model || parsed.model_number || '').trim();
      const wattage = Number(parsed.wattage) || (modelName.match(/(\d{3,4})\s*W?/i)?.[1] ? Number(modelName.match(/(\d{3,4})\s*W?/i)?.[1]) : undefined);
      const palletNumber = (parsed.palletNumber || parsed.pallet_box_number || parsed.barcode || '').trim();
      const batchDate = (parsed.batchDate || parsed.date || '').trim();
      const rawNotes = (parsed.rawNotes || parsed.notes || parsed.remarks || '').trim();

      let category: PalletScanResult['category'] = 'solar_panel';
      const catLower = String(parsed.category || '').toLowerCase();
      if (catLower.includes('inverter')) category = 'inverter';
      else if (catLower.includes('battery')) category = 'battery';
      else if (catLower.includes('structure')) category = 'structure';
      else if (catLower.includes('other')) category = 'other';

      // Construct a clean, professional suggested product name
      let suggestedName = '';
      if (brand && wattage) {
        suggestedName = `${brand} ${wattage}W Mono PERC Solar Panel`;
      } else if (brand && modelName) {
        suggestedName = `${brand} ${modelName}`;
      } else if (modelName) {
        suggestedName = modelName;
      } else if (brand) {
        suggestedName = `${brand} Solar Equipment`;
      } else {
        suggestedName = 'Solar Panel Module';
      }

      const quantity = Number(parsed.quantity) || uniqueSerials.length;

      return {
        brand: brand || undefined,
        model: modelName || undefined,
        wattage,
        category,
        suggestedName,
        palletNumber: palletNumber || undefined,
        batchDate: batchDate || undefined,
        quantity: quantity || uniqueSerials.length,
        serialNumbers: uniqueSerials,
        rawNotes: rawNotes || undefined,
        success: uniqueSerials.length > 0 || !!modelName
      };
    } catch (err) {
      console.warn(`Error running Gemini model ${model}:`, err);
    }
  }

  return {
    category: 'solar_panel',
    suggestedName: '',
    quantity: 0,
    serialNumbers: [],
    success: false,
    error: 'Gemini Vision AI could not process this image.'
  };
}

/**
 * Extract Pallet, Model, and all Serial Numbers from Box / Pallet Label image using Groq Vision AI
 */
export async function extractPalletDetailsGroqAI(
  base64DataUrl: string
): Promise<PalletScanResult> {
  if (!GROQ_API_KEY || !base64DataUrl) {
    return {
      category: 'solar_panel',
      suggestedName: '',
      quantity: 0,
      serialNumbers: [],
      success: false,
      error: 'Groq API Key or Image source missing'
    };
  }

  const prompt = `You are an expert Solar & Electrical equipment warehouse logistics OCR specialist.
Examine this solar panel / inverter / equipment pallet packing slip or box label image very carefully.
Extract the following details:
1. brand: Manufacturer / Brand name (e.g. Waaree, Vikram Solar, Goldi, Adani, Tata, Growatt, Solis, etc. Look at the OA no, label, model, or text).
2. model: The exact model number (e.g. BI-55-540-EVEP-10-MC4-0300-33-PTG-DCR-EC).
3. wattage: Extract panel wattage number if visible in model or text (e.g. 540 from BI-55-540).
4. category: Product category, choose one of: "solar_panel", "inverter", "battery", "structure", "other".
5. quantity: Total number of modules/items (e.g. 33).
6. palletNumber: Pallet/box number or large barcode number (e.g. 18126426871).
7. batchDate: Date on label if visible (e.g. 21-May-2026).
8. rawNotes: Any OA number, remarks, labelling notes (e.g. "OA: WAAREE-KM, Remarks: J-10-200-400-33").
9. serialNumbers: An array of ALL individual product serial numbers listed in the table or grid (e.g. WS05269070984561, etc.). Be extremely thorough and extract every single serial number present in the table without skipping any.

Return your response ONLY as valid JSON in this exact structure:
{
  "brand": "Waaree",
  "model": "BI-55-540-EVEP-10-MC4-0300-33-PTG-DCR-EC",
  "wattage": 540,
  "category": "solar_panel",
  "quantity": 33,
  "palletNumber": "18126426871",
  "batchDate": "21-May-2026",
  "rawNotes": "OA: WAAREE-KM, Remarks: J-10-200-400-33",
  "serialNumbers": ["WS05269070984561", "WS05269070910064"]
}`;

  const visionModels = ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b'];

  for (const model of visionModels) {
    try {
      console.log(`🔍 Groq Vision AI scanning pallet label with model ${model}...`);
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: base64DataUrl } }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
          max_tokens: 3500
        })
      });

      if (response.status === 401) {
        console.warn('Groq API key is invalid or expired (401). Skipping Groq fallback.');
        break;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Groq model ${model} responded with ${response.status}:`, errText);
        continue;
      }

      const data = await response.json();
      const contentStr = data.choices?.[0]?.message?.content || '{}';
      console.log(`🤖 Groq Pallet AI Output (${model}):`, contentStr.slice(0, 300) + '...');

      const parsed = parseJsonSafely(contentStr);
      if (!parsed) {
        console.warn('Failed to parse Groq Vision response as JSON');
        continue;
      }

      // Clean and normalize serial numbers
      const rawSerials = Array.isArray(parsed.serialNumbers)
        ? parsed.serialNumbers
        : Array.isArray(parsed.serial_numbers)
        ? parsed.serial_numbers
        : [];

      const cleanSerials: string[] = rawSerials
        .map((s: any) => String(s || '').trim().replace(/[,;]+$/, ''))
        .filter((s: string) => s.length >= 4 && !s.toLowerCase().includes('total'));

      // Deduplicate serials while preserving order
      const uniqueSerials = Array.from(new Set(cleanSerials));

      const brand = (parsed.brand || parsed.brand_manufacturer || '').trim();
      const modelName = (parsed.model || parsed.model_number || '').trim();
      const wattage = Number(parsed.wattage) || (modelName.match(/(\d{3,4})\s*W?/i)?.[1] ? Number(modelName.match(/(\d{3,4})\s*W?/i)?.[1]) : undefined);
      const palletNumber = (parsed.palletNumber || parsed.pallet_box_number || parsed.barcode || '').trim();
      const batchDate = (parsed.batchDate || parsed.date || '').trim();
      const rawNotes = (parsed.rawNotes || parsed.notes || parsed.remarks || '').trim();

      let category: PalletScanResult['category'] = 'solar_panel';
      const catLower = String(parsed.category || '').toLowerCase();
      if (catLower.includes('inverter')) category = 'inverter';
      else if (catLower.includes('battery')) category = 'battery';
      else if (catLower.includes('structure')) category = 'structure';
      else if (catLower.includes('other')) category = 'other';

      // Construct a clean, professional suggested product name
      let suggestedName = '';
      if (brand && wattage) {
        suggestedName = `${brand} ${wattage}W Mono PERC Solar Panel`;
      } else if (brand && modelName) {
        suggestedName = `${brand} ${modelName}`;
      } else if (modelName) {
        suggestedName = modelName;
      } else if (brand) {
        suggestedName = `${brand} Solar Equipment`;
      } else {
        suggestedName = 'Solar Panel Module';
      }

      const quantity = Number(parsed.quantity) || uniqueSerials.length;

      return {
        brand: brand || undefined,
        model: modelName || undefined,
        wattage,
        category,
        suggestedName,
        palletNumber: palletNumber || undefined,
        batchDate: batchDate || undefined,
        quantity: quantity || uniqueSerials.length,
        serialNumbers: uniqueSerials,
        rawNotes: rawNotes || undefined,
        success: uniqueSerials.length > 0 || !!modelName
      };
    } catch (err) {
      console.warn(`Error running Groq model ${model}:`, err);
    }
  }

  return {
    category: 'solar_panel',
    suggestedName: '',
    quantity: 0,
    serialNumbers: [],
    success: false,
    error: 'Groq Vision extraction could not process this image.'
  };
}

/**
 * Local Client-Side Tesseract OCR Fallback for Pallet Label Scanning
 * Runs directly in the browser with 0 external API dependencies
 */
export async function extractPalletDetailsLocalOCR(
  base64DataUrl: string
): Promise<PalletScanResult> {
  try {
    console.log('🔍 Running Local High-Speed OCR on Pallet image...');
    const result = await Tesseract.recognize(base64DataUrl, 'eng', {
      logger: () => {}
    });

    const text = result.data.text || '';
    console.log('📄 Local OCR Pallet Raw Text:', text.slice(0, 300));

    // Common brand detection
    let detectedBrand = '';
    const brandMatches = text.match(/\b(Waaree|Vikram|Goldi|Adani|Tata|Growatt|Solis|Luminous|Microtek|Infinisolar|Sungrow|GoodWe|SMA|Havells|Polycab|Anchor|Panasonic)\b/i);
    if (brandMatches) {
      detectedBrand = brandMatches[0];
    }

    // Wattage detection: 3-4 digits before W / Wp
    let detectedWattage: number | undefined;
    const wattMatch = text.match(/\b(\d{3,4})\s*(?:W|Wp|watt)\b/i);
    if (wattMatch) {
      detectedWattage = Number(wattMatch[1]);
    }

    // Model detection
    let detectedModel = '';
    const modelMatch = text.match(/\b([A-Z0-9]{2,8}-[A-Z0-9-]{6,30})\b/);
    if (modelMatch) {
      detectedModel = modelMatch[0];
    }

    // Pallet / Barcode number
    let palletNumber = '';
    const palletMatch = text.match(/(?:pallet|box|barcode)\s*[:#]?\s*([A-Z0-9]{8,18})/i);
    if (palletMatch) {
      palletNumber = palletMatch[1];
    }

    // Extract serial numbers: 10-25 alphanumeric tokens
    const tokens = text.split(/[\s,\t\r\n]+/);
    const candidateSerials: string[] = [];

    for (const token of tokens) {
      const clean = token.replace(/[^A-Za-z0-9]/g, '').trim();
      if (clean.length >= 10 && clean.length <= 25 && /[A-Za-z]/.test(clean) && /\d/.test(clean)) {
        const lower = clean.toLowerCase();
        if (
          !lower.includes('serial') &&
          !lower.includes('number') &&
          !lower.includes('module') &&
          !lower.includes('barcode') &&
          !lower.includes('pallet') &&
          !lower.includes('waaree') &&
          !lower.includes('vikram')
        ) {
          candidateSerials.push(clean);
        }
      }
    }

    const uniqueSerials = Array.from(new Set(candidateSerials));

    if (uniqueSerials.length > 0 || detectedModel || detectedBrand) {
      return {
        brand: detectedBrand || undefined,
        model: detectedModel || undefined,
        wattage: detectedWattage,
        category: 'solar_panel',
        suggestedName: detectedBrand && detectedWattage
          ? `${detectedBrand} ${detectedWattage}W Solar Panel`
          : detectedBrand || detectedModel || 'Solar Panel Module',
        palletNumber: palletNumber || undefined,
        quantity: uniqueSerials.length,
        serialNumbers: uniqueSerials,
        success: true
      };
    }
  } catch (err) {
    console.warn('Local OCR pallet extraction note:', err);
  }

  return {
    category: 'solar_panel',
    suggestedName: '',
    quantity: 0,
    serialNumbers: [],
    success: false,
    error: 'Local OCR could not find serial numbers in this image.'
  };
}

/**
 * Master Pallet & Serial Number Extraction function from File, Blob, or URL
 * Tries Google Gemini Vision AI (with Lite/Flash models), then Local OCR
 */
export async function extractPalletProductDetailsWithAI(
  imageSource: File | Blob | string
): Promise<PalletScanResult> {
  try {
    // 1. Optimize image (resizes down to max 1800px to prevent 503 errors and payload overloads)
    const base64DataUrl = await optimizeImageForVision(imageSource, 1800);
    if (!base64DataUrl) {
      return {
        category: 'solar_panel',
        suggestedName: '',
        quantity: 0,
        serialNumbers: [],
        success: false,
        error: 'Failed to read image file.'
      };
    }

    // 2. Primary Engine: Google Gemini Vision AI
    console.log('🚀 Extracting Pallet details with Google Gemini Vision AI...');
    const geminiResult = await extractPalletDetailsGeminiAI(base64DataUrl);
    if (geminiResult.success && geminiResult.serialNumbers.length > 0) {
      console.log(`✨ Gemini Vision AI successfully extracted ${geminiResult.serialNumbers.length} serials!`);
      return geminiResult;
    }

    // 3. Fallback Engine: Groq Vision AI (if key is configured and not default expired)
    if (GROQ_API_KEY && !GROQ_API_KEY.includes('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')) {
      console.log('🔄 Trying Groq Vision AI fallback...');
      const groqResult = await extractPalletDetailsGroqAI(base64DataUrl);
      if (groqResult.success && groqResult.serialNumbers.length > 0) {
        console.log(`✨ Groq Vision AI successfully extracted ${groqResult.serialNumbers.length} serials!`);
        return groqResult;
      }
    }

    // 4. Client-Side Fallback Engine: Local Tesseract OCR
    console.log('⚡ Running local client-side OCR fallback for pallet scanning...');
    const localResult = await extractPalletDetailsLocalOCR(base64DataUrl);
    if (localResult.success && localResult.serialNumbers.length > 0) {
      console.log(`✨ Local OCR successfully extracted ${localResult.serialNumbers.length} serials!`);
      return localResult;
    }

    // Return Gemini result if it had partial info (e.g. detected model), else local error
    if (geminiResult.success) return geminiResult;

    return {
      category: 'solar_panel',
      suggestedName: '',
      quantity: 0,
      serialNumbers: [],
      success: false,
      error: 'Could not extract serial numbers. Please ensure the label and serial numbers table are clearly visible and well lit.'
    };
  } catch (err: any) {
    console.error('Pallet AI extraction error:', err);
    return {
      category: 'solar_panel',
      suggestedName: '',
      quantity: 0,
      serialNumbers: [],
      success: false,
      error: err?.message || 'Error processing image.'
    };
  }
}

