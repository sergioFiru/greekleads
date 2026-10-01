import { notFound } from 'next/navigation'

/**
 * Πελατολόγιο is temporarily closed.
 *
 * The lists half of the CRM is not finished, so the whole section is off the
 * site rather than half-shipped. Saved searches — the part that did work — moved
 * to the topbar menu on /search, which is where they get used anyway.
 *
 * Nothing is deleted: crm_lists / crm_list_members / crm_saved_searches keep
 * their rows, CrmPage and CrmListDetail stay in the repo, and the
 * /api/crm/searches routes still serve the search page. Reopening this is
 * restoring the body of this file.
 */
export default function CrmRoute() {
  notFound()
}
