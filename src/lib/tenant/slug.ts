type CompanyLookupClient = {
  company: {
    findUnique(args: { where: { slug: string }; select: { id: true } }): Promise<{ id: string } | null>;
  };
};

export function generateSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return slug || "company";
}

export async function generateUniqueCompanySlug(client: CompanyLookupClient, companyName: string) {
  const baseSlug = generateSlug(companyName);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const existing = await client.company.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing) {
      return slug;
    }
  }

  throw new Error("Could not generate unique company slug.");
}
