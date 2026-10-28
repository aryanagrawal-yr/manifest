// Settings for the app. No secrets belong in this file (the site is public).
window.APP_CONFIG = {
  // PRIVATE GitHub repo where records are stored (one JSON file per dispatch).
  // The app refuses to run if this repo is public.
  owner: "aryanagrawal-yr",
  repo: "razzai-manifest-data",
  dataDir: "data",   // folder inside the private data repo
  idPrefix: "RW",
  branch: "main",

  partners: ["Harda to Indore", "Indore to Harda"],   // trunk directions
  vehicleTypes: ["Truck", "Mini Truck", "Tempo", "Container", "Other"],

  // Text printed on the manifest PDF (matches the supplied design)
  brand: {
    title: "YOUTH ROBE",
    tagline: "Logistics partner: Razzai World",
    documentTitle: "TRUCK MANIFEST",
    vendor: "Youth Robe",
    footer: "YOUTH ROBE x RAZZAI WORLD - Harda <> Indore trunk dispatch",
    url: "youthrobe.com",
    logo: true,
    copies: ["ORIGIN COPY", "DESTINATION COPY", "DRIVER COPY"],
    gateCopies: ["SECURITY COPY", "DRIVER COPY"]
  }
};
