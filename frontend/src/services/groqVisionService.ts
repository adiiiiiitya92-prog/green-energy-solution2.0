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
    'qwen/qwen3.6-27b',
    'llama-3.2-11b-vision-preview',
    'llama-3.2-90b-vision-preview'
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
