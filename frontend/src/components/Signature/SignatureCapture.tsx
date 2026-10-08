import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

interface SignatureCaptureProps {
  onSave: (signatureBlob: Blob, signatureDataUrl: string) => void;
  onClear?: () => void;
}

export const SignatureCapture: React.FC<SignatureCaptureProps> = ({ onSave, onClear }) => {
  const sigPad = useRef<SignatureCanvas>(null);

  const handleClear = () => {
    sigPad.current?.clear();
    if (onClear) onClear();
  };

  const handleSave = () => {
    if (sigPad.current?.isEmpty()) {
      alert('Please provide a signature first.');
      return;
    }

    const canvas = sigPad.current?.getCanvas();
    if (canvas) {
      canvas.toBlob((blob) => {
        if (blob) {
          const dataUrl = URL.createObjectURL(blob);
          onSave(blob, dataUrl);
        }
      }, 'image/png');
    }
  };

  return (
    <div className="flex flex-col space-y-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="flex justify-between items-center">
        <label className="text-sm font-bold text-slate-700">Client Signature Pad</label>
        <button
          type="button"
          onClick={handleClear}
          className="text-xs text-rose-500 hover:text-rose-700 font-semibold transition-colors cursor-pointer"
        >
          Clear Pad
        </button>
      </div>

      <div className="border border-dashed border-slate-300 rounded-lg overflow-hidden bg-slate-50 h-40">
        <SignatureCanvas
          ref={sigPad}
          onEnd={handleSave}
          penColor="#0f172a"
          canvasProps={{
            width: 500,
            height: 160,
            className: 'w-full h-full cursor-crosshair bg-slate-50'
          }}
        />
      </div>

      <div className="flex justify-between items-center text-xs text-slate-500">
        <span>Sign inside the dashed box above.</span>
        <button
          type="button"
          onClick={handleSave}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
        >
          Confirm Signature
        </button>
      </div>
    </div>
  );
};
