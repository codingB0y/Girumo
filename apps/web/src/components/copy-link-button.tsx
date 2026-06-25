"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";

type CopyLinkButtonSize = "sm" | "md" | "icon";
type CopyLinkButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";

type CopyLinkButtonProps = {
  url: string;
  label?: string;
  copiedLabel?: string;
  disabled?: boolean;
  className?: string;
  size?: CopyLinkButtonSize;
  variant?: CopyLinkButtonVariant;
};

export function CopyLinkButton({
  url,
  label = "Copiar link",
  copiedLabel = "Copiado",
  disabled = false,
  className,
  size = "sm",
  variant = "outline",
}: CopyLinkButtonProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDisabled = disabled || !url;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function copyLink() {
    if (isDisabled) return;

    try {
      await writeToClipboard(url);
      setCopied(true);
      toast("Link copiado", "success");

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("Nao foi possivel copiar o link", "error");
    }
  }

  const Icon = copied ? Check : Copy;
  const text = copied ? copiedLabel : label;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={isDisabled}
      aria-label={size === "icon" ? text : undefined}
      onClick={copyLink}
    >
      <Icon className={copied ? "h-4 w-4 text-green-600" : "h-4 w-4"} aria-hidden="true" />
      {size !== "icon" && <span>{text}</span>}
    </Button>
  );
}

async function writeToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      fallbackCopy(text);
      return;
    }
  }

  fallbackCopy(text);
}

function fallbackCopy(text: string) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";

  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Copy command failed");
  }
}
