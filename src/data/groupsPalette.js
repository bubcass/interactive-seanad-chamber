export const groupsPalette = [
  { name: "Civil Engagement", value: "#1f7a8c" },
  { name: "Cross-Party Group", value: "#c0841a" },
  { name: "No group listed", value: "#6b7280" },
];

export const groupColorMap = Object.fromEntries(
  groupsPalette.map((group) => [group.name, group.value]),
);

export function getGroupColor(groupName) {
  return groupColorMap[groupName] || "#9ca3af";
}
