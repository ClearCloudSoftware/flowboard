/** A project's slug, the `/p/<slug>` in its address. No Node imports: the wizard previews it. */

/** `My API (v2)` -> `my-api-v2`. */
export const slugify = (name: string) =>
  name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'project';

/** The slug from the name; when another project has it, from owner-name; numbered past ones in use. */
export function projectSlug(projects: { slug: string }[], name: string, owner?: string): string {
  const taken = (slug: string) => projects.some((p) => p.slug === slug);
  const base = taken(slugify(name)) && owner ? slugify(`${owner}-${name}`) : slugify(name);
  let slug = base;
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

