import React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, Bell, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export function ReminderCard({ message, type = 'info', onClick, className }) {
  const getIcon = () => {
    switch (type) {
      case 'alert':
        return <AlertCircle size={15} className="text-tf-warning shrink-0" />;
      case 'warning':
        return <AlertCircle size={15} className="text-tf-danger shrink-0" />;
      case 'success':
        return <CheckCircle size={15} className="text-tf-success shrink-0" />;
      default:
        return <Clock size={15} className="text-tf-accent shrink-0" />;
    }
  };

  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -1 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      onClick={onClick}
      className={twMerge(
        "p-3 rounded-md border border-tf-border bg-tf-surface flex items-center justify-between gap-3 shadow-xs hover:shadow-md cursor-pointer transition-shadow select-none",
        className
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-md bg-tf-surface-2 border border-tf-border flex items-center justify-center shrink-0">
          {getIcon()}
        </div>
        <span className="text-xs text-tf-text font-normal truncate">
          {message}
        </span>
      </div>
      <ChevronRight size={14} className="text-tf-text-tertiary shrink-0" />
    </motion.div>
  );
}
