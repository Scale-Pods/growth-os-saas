"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Check, ChevronDown, Plus } from "lucide-react";
import type { Brand } from "@growth-os/db";

interface BrandSwitcherProps {
  currentBrand: Brand | null;
  brands: Brand[];
  collapsed?: boolean;
  onBrandSelect?: (brand: Brand) => void;
}

export function BrandSwitcher({
  currentBrand,
  brands,
  collapsed,
  onBrandSelect,
}: BrandSwitcherProps) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchBrand = (brand: Brand) => {
    document.cookie = `active_brand_id=${brand.id}; path=/; max-age=31536000; SameSite=Lax`;
    if (onBrandSelect) {
      onBrandSelect(brand);
    } else {
      window.location.reload();
    }
  };

  if (collapsed) {
    return (
      <div className="relative flex justify-center py-1" ref={dropdownRef}>
        <button
          onClick={() => setOpen(!open)}
          title={`Active Brand: ${currentBrand?.name || "Select Brand"}`}
          className="w-10 h-10 rounded-xl bg-panel border border-border flex items-center justify-center text-secondary hover:border-secondary/50 transition-colors"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {open && (
          <div className="absolute left-14 top-0 w-56 p-2 rounded-2xl border border-glass-border bg-card shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
              Brands ({brands.length})
            </div>
            <div className="py-1 max-h-48 overflow-y-auto space-y-1">
              {brands.map((brand) => (
                <button
                  key={brand.id}
                  onClick={() => {
                    switchBrand(brand);
                    setOpen(false);
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-fill-tertiary text-left text-xs transition-colors"
                >
                  <span className="font-medium text-foreground truncate">{brand.name}</span>
                  {currentBrand?.id === brand.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl border border-border/60 bg-fill-quaternary hover:bg-fill-tertiary text-left transition-all group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse flex-shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-muted-foreground">Active Brand</div>
            <div className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
              {currentBrand?.name || "Select a brand"}
            </div>
          </div>
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 p-2 rounded-2xl border border-glass-border bg-card shadow-2xl backdrop-blur-xl z-50 animate-in fade-in zoom-in-95">
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
            Switch Brand
          </div>
          <div className="py-1 max-h-48 overflow-y-auto space-y-1">
            {brands.map((brand) => (
              <button
                key={brand.id}
                onClick={() => {
                  switchBrand(brand);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-fill-tertiary text-left text-xs transition-colors"
              >
                <span className="font-medium text-foreground truncate">{brand.name}</span>
                {currentBrand?.id === brand.id && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
              </button>
            ))}
            <div className="pt-1.5 mt-1 border-t border-border/40">
              <Link
                href="/clients"
                onClick={() => setOpen(false)}
                className="w-full flex items-center gap-1.5 p-2 rounded-lg text-primary hover:bg-primary/10 text-xs font-medium transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Brand Kit & Settings</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
