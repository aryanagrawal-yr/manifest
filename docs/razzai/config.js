// Settings for the app. No secrets belong in this file (the site is public).
window.APP_CONFIG = {
  // PRIVATE GitHub repo where records are stored (one JSON file per dispatch).
  // The app refuses to run if this repo is public.
  owner: "aryanagrawal-yr",
  repo: "manifest-data",
  dataDir: "razzai-data",   // folder inside the private data repo (Youth Robe uses "data")
  idPrefix: "RW",
  branch: "main",

  partners: ["Harda to Indore", "Indore to Harda"],   // trunk directions
  vehicleTypes: ["Truck", "Mini Truck", "Tempo", "Container", "Other"],

  // Text printed on the manifest PDF (matches the supplied design)
  brand: {
    title: "RAZZAI WORLD",
    tagline: "Harda - Indore trunk dispatch",
    documentTitle: "TRUCK MANIFEST",
    vendor: "Razzai World",
    footer: "Razzai World - Harda <> Indore trunk dispatch",
    url: "",
    logo: false,
    copies: ["ORIGIN COPY", "DESTINATION COPY", "DRIVER COPY"],
    gateCopies: ["SECURITY COPY", "DRIVER COPY"]
  }
};
