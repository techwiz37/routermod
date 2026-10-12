"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import { Button, Modal } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

const PLACEHOLDER = `email1@example.com|password123
email2@example.com|password456
email3@example.com|password789`;

export default function BulkImportAntigravityModal({ isOpen, onClose }) {
  const [inputText, setInputText] = useState("");
  const [error, setError] = useState("");
  const addNotification = useNotificationStore((s) => s.addNotification);

  const handleClose = () => {
    setInputText("");
    setError("");
    onClose();
  };

  const handleSubmit = () => {
    setError("");
    const trimmed = inputText.trim();
    if (!trimmed) {
      setError("Masukkan data email|password terlebih dahulu");
      return;
    }

    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const validLines = lines.filter((l) => l.includes("|"));
    if (validLines.length === 0) {
      setError("Format salah. Gunakan: email|password (satu per baris)");
      return;
    }

    addNotification({
      type: "warning",
      title: "VIP Source",
      message: "Bot auto add hanya untuk VIP source.",
      duration: 6000,
    });

    handleClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="BULK ADD ANTIGRAVITY" size="md">
      <div className="space-y-4">
        <p className="text-xs text-text-muted leading-relaxed">
          Masukkan daftar akun dengan format <code className="font-mono text-primary font-bold">email|password</code>, pisahkan setiap akun dengan baris baru (Enter).
        </p>

        <div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={7}
            className="w-full rounded-lg border-2 border-border bg-surface p-3 font-mono text-xs text-text-main shadow-[2px_2px_0_var(--color-border)] focus:border-primary focus:outline-none"
          />
          {error && <p className="mt-1 text-xs text-red-600 font-medium">{error}</p>}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSubmit} fullWidth icon="smart_toy">
            Submit
          </Button>
          <Button onClick={handleClose} variant="ghost" fullWidth>
            Batal
          </Button>
        </div>
      </div>
    </Modal>
  );
}

BulkImportAntigravityModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};
