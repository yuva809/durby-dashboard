// Mirrors backend/src/modules/scheduling/role-coverage.util.ts — kept in
// sync manually since frontend and backend don't share a package. Used by
// the scheduling page's replacement suggestions so the UI offers exactly
// the same candidates the backend would actually accept.

export type RoleCoverageMap = Map<string, Set<string>>;

export function buildRoleCoverageMap(rules: { role: string; canCover: string }[]): RoleCoverageMap {
  const map: RoleCoverageMap = new Map();
  for (const rule of rules) {
    if (!map.has(rule.role)) map.set(rule.role, new Set());
    map.get(rule.role)!.add(rule.canCover);
  }
  return map;
}

export function isEligibleForRole(
  empRole: string,
  empSecondaryRoles: string[],
  targetRole: string,
  coverageMap: RoleCoverageMap,
): boolean {
  if (empRole === targetRole) return true;
  if (empSecondaryRoles.includes(targetRole)) return true;
  return coverageMap.get(empRole)?.has(targetRole) ?? false;
}
