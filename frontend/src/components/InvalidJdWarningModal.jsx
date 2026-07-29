import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './ui/Button';
import { MotionModal } from '../motion/MotionSystem';

function InvalidJdWarningModal({ isOpen, onClose, onPasteManually }) {
  return (
    <MotionModal open={isOpen} onClose={onClose} className="max-w-sm p-6 space-y-4 select-none font-sans">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-tf-warning/10 border border-tf-warning/20 flex items-center justify-center text-tf-warning shrink-0">
            <AlertCircle size={18} />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-tf-text">Invalid Job Details</h3>
            <p className="text-xs text-tf-text-secondary font-normal mt-0.5">Scanned page is not a job posting</p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-tf-text-secondary">
          The content on this page does not appear to contain job requirements or recruitment details. Please navigate to a job posting (e.g., on LinkedIn, Indeed, or Greenhouse) and try again, or paste the text manually.
        </p>

        <div className="flex gap-2.5 pt-2">
          <Button
            variant="secondary"
            size="md"
            onClick={onPasteManually}
            className="flex-1"
          >
            Paste Manually
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onClose}
            className="flex-1"
          >
            Close
          </Button>
        </div>
    </MotionModal>
  );
}

export default InvalidJdWarningModal;

