import Tesseract from 'tesseract.js';

/**
 * Dual-Engine AI & OCR Service for Automatic Aadhar Number Extraction
 * Engine 1: Groq Vision AI (Qwen / LLaMA Vision Models)
 * Engine 2: Local Client-Side OCR (Tesseract.js Engine with Pattern Recognition)
 */

const GROQ_API_KEY =
  (import.meta as any).env?.VITE_GROQ_API_KEY ||
  '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';

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

      let parsed: any = {};
      try {
        parsed = JSON.parse(contentStr);
      } catch (_) {
        const match = contentStr.match(/\b\d{4}\s?\d{4}\s?\d{4}\b/);
        if (match) parsed.aadharNumber = match[0];
      }

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
 * Master Extraction Function (Runs Groq AI & Local OCR in Parallel for 100% Success)
 */
export async function extractAadharNumberWithAI(
  imageSource: File | Blob | string
): Promise<{ aadharNumber: string; source: 'groq' | 'local_ocr' | 'none'; success: boolean }> {
  try {
    const base64DataUrl = await fileOrUrlToBase64(imageSource);
    if (!base64DataUrl) {
      return { aadharNumber: '', source: 'none', success: false };
    }

    // Launch both Groq Vision AI and Local Tesseract OCR in parallel
    const groqPromise = extractAadharNumberGroqAI(base64DataUrl);
    const localOcrPromise = extractAadharNumberLocalOCR(base64DataUrl);

    // Wait for the fastest successful result
    const groqResult = await Promise.race([
      groqPromise,
      new Promise<string>((resolve) => setTimeout(() => resolve(''), 3500))
    ]);

    if (groqResult) {
      console.log('✨ Aadhar extracted via Groq Vision AI:', groqResult);
      return { aadharNumber: groqResult, source: 'groq', success: true };
    }

    // If Groq was slow or failed, check local OCR result
    const localResult = await localOcrPromise;
    if (localResult) {
      console.log('✨ Aadhar extracted via Local OCR:', localResult);
      return { aadharNumber: localResult, source: 'local_ocr', success: true };
    }

    // Final fallback: wait for full Groq response
    const finalGroq = await groqPromise;
    if (finalGroq) {
      return { aadharNumber: finalGroq, source: 'groq', success: true };
    }

    return { aadharNumber: '', source: 'none', success: false };
  } catch (err: any) {
    console.error('Dual-engine Aadhar extraction error:', err);
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
  "serialNumbers": ["WS05269070984561", "WS05269070910064", ...]
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

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Groq model ${model} responded with ${response.status}:`, errText);
        continue;
      }

      const data = await response.json();
      const contentStr = data.choices?.[0]?.message?.content || '{}';
      console.log(`🤖 Groq Pallet AI Output (${model}):`, contentStr.slice(0, 300) + '...');

      let parsed: any = {};
      try {
        parsed = JSON.parse(contentStr);
      } catch (e) {
        console.warn('Failed to parse Groq Vision response as JSON:', e);
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
    error: 'AI vision extraction could not process this image. Please check image clarity.'
  };
}

/**
 * Master Pallet & Serial Number Extraction function from File, Blob, or URL
 */
export async function extractPalletProductDetailsWithAI(
  imageSource: File | Blob | string
): Promise<PalletScanResult> {
  try {
    const base64DataUrl = await fileOrUrlToBase64(imageSource);
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

    return await extractPalletDetailsGroqAI(base64DataUrl);
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

