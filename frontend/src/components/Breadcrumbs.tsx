import { ChevronRight } from "lucide-react";
import { useBreadcrumbs } from "../hooks/useBreadcrumbs";

export const Breadcrumbs = () => {
  const crumbs = useBreadcrumbs();

  if (!crumbs.length) return null;

  return (
    <nav className="flex items-center gap-x-2">
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-x-2">
          {index > 0 && <ChevronRight size={14} color="#64748B" />}
          {index === crumbs.length - 1 ? (
            <p className="text-sm text-[#09090B]">{crumb.label}</p>
          ) : (
            <p className="text-sm text-[#64748B]">{crumb.label}</p>
          )}
        </span>
      ))}
    </nav>
  );
};
