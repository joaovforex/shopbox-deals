import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

type Props = {
  value: string;
  height?: number;
  width?: number;
  fontSize?: number;
  displayValue?: boolean;
  className?: string;
};

/**
 * Renders a Code128 barcode as an inline SVG. Safe for print and PDF
 * (html2canvas) because it's a static SVG with no external assets.
 */
export function Barcode({
  value,
  height = 50,
  width = 1.6,
  fontSize = 12,
  displayValue = true,
  className,
}: Props) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width,
        fontSize,
        displayValue,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      // ignore invalid values
    }
  }, [value, height, width, fontSize, displayValue]);

  return <svg ref={ref} className={className} />;
}
