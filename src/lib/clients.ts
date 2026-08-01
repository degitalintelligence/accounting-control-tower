export function slugifyClientName(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "client";
}

export function shouldUpdateClientSlug(currentSlug: string, previousName: string) {
  return currentSlug === slugifyClientName(previousName);
}
