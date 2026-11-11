/* Site-wide configuration. Edit this file to point the site at a different
   WordPress install — nothing else needs to change. */
window.LG_CONFIG = {
  /* WordPress REST API root. Must be reachable over HTTPS and send CORS
     headers (WordPress does this by default for public GET requests). */
  wpBase: "https://www.lexgeneralis.com/wp-json/wp/v2",

  /* Posts shown per page on /blog */
  postsPerPage: 10,

  /* Where attorney bios come from.
       "pages" — each attorney is a normal WordPress Page, matched by slug
                 (this is how lexgeneralis.com is set up today).
       "cpt"   — a custom post type, e.g. /wp-json/wp/v2/attorney
     See README.md for how to switch. */
  attorneySource: "pages",
  attorneyCpt: "attorney",

  /* Contact details used in the header and footer */
  contactEmail: "info@lexgeneralis.com",
  address: "5227 N. 7th St., Suite 18056, Phoenix, AZ 85014"
};
