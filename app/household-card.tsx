import type { HTMLAttributes } from "react";
import ChoreSymbol from "./chore-symbol";

export default function HouseholdCard({ title, className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`household-card ${className}`}>
    {title && <ChoreSymbol title={title} className="chore-watermark" />}
    {children}
  </div>;
}
