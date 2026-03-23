import { useLocation, matchPath, useParams } from "react-router-dom";

export function useBreadcrumbs() {
  const location = useLocation();
  const params = useParams();

  const breadcrumbs: { path: string; label: string }[] = [];

  const matchedKeys = Object.keys(breadcrumbMap).filter((key) =>
    matchPath({ path: key, end: false }, location.pathname),
  );

  const matchKey = matchedKeys.sort((a, b) => b.length - a.length)[0];
  let currentKey: string | undefined = matchKey;

  while (currentKey) {
    const item = breadcrumbMap[currentKey] as BreadcrumbItem | undefined;
    if (!item) break;

    const { label, parent, dynamicLabel }: BreadcrumbItem = item;

    const breadcrumbLabel = dynamicLabel ? dynamicLabel(params) : label;

    breadcrumbs.unshift({
      path: currentKey,
      label: breadcrumbLabel,
    });

    currentKey = parent;
  }

  return breadcrumbs;
}

export type BreadcrumbItem = {
  label: string;
  parent?: string;
  dynamicLabel?: (params: Record<string, string | undefined>) => string;
};

export const breadcrumbMap: Record<string, BreadcrumbItem> = {
  "/hr": { label: "Employees management" },
  "/hr/people": { label: "People", parent: "/hr" },
  "/hr/my-profile/:id": {
    label: "My Profile",
    parent: "/hr",
  },
  "/hr/people/:id": {
    label: "Profile",
    parent: "/hr",
  },
  "/hr/away": {
    label: "Who's Away",
    parent: "/hr",
  },
  "/hr/time-away-requests": {
    label: "Requests",
    parent: "/hr",
  },
  "/hr/settings": {
    label: "Settings",
    parent: "/hr",
  },
  "/hr/settings/company": {
    label: "Company",
    parent: "/hr/settings",
  },
  "/hr/settings/time-away": {
    label: "Time Away",
    parent: "/hr/settings",
  },
  "/pricing": {
    label: "Pricing management",
  },
  "/pricing/listings": {
    label: "Listings pricing",
    parent: "/pricing",
  },
  "/pricing/listings/:id": {
    label: "Listing details",
    parent: "/pricing/listings",
  },
  "/pricing/groups": {
    label: "Groups pricing",
    parent: "/pricing",
  },
};
