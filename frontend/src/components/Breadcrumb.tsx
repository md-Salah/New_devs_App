import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  return (
    <nav className="flex items-center space-x-1 text-sm text-gray-500 mb-4">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        
        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
            {item.href && !isLast ? (
              <Link
                to={item.href}
                className="hover:text-gray-700 transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "text-gray-900 font-medium" : ""}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};
