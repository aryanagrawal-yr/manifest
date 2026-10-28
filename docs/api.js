// GitHub storage layer. Each dispatch is one JSON file: data/YYYY-MM/YR-YYYYMMDD-NNN.json
(function (root) {
  const cfg = root.APP_CONFIG;
  const API = "https://api.github.com";
  const ID_RE = /^YR-\d{8}-\d{3}$/;
  let token = null;

  function b64(str) {
    const bytes = new TextEncoder().encode(str);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function unb64(b) {
    const bin = atob(String(b).replace(/\n/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  async function req(method, path, body) {
    const headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const err = new Error((data && data.message) || "GitHub error " + res.status);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function gql(query, variables) {
    const data = await req("POST", "/graphql", { query, variables: Object.assign({ o: cfg.owner, n: cfg.repo }, variables) });
    if (data.errors && data.errors.length && !data.data) throw new Error(data.errors[0].message);
    return data.data;
  }

  const Q_TREE = "query($o:String!,$n:String!,$e:String!){repository(owner:$o,name:$n){object(expression:$e){... on Tree{entries{name type}}}}}";
  const Q_FILES = "query($o:String!,$n:String!,$e:String!){repository(owner:$o,name:$n){object(expression:$e){... on Tree{entries{name object{... on Blob{oid text}}}}}}}";

  function cleanRecord(raw, sha, path) {
    const r = JSON.parse(raw);
    if (!r || !ID_RE.test(r.id) || !Array.isArray(r.items)) return null;
    r.items = r.items.map(String);
    r._sha = sha;
    r._path = path;
    return r;
  }

  async function connect(t) {
    token = String(t || "").trim();
    if (!token) throw new Error("Enter your access token.");
    const u = await req("GET", "/user");
    let repo;
    try {
      repo = await req("GET", `/repos/${cfg.owner}/${cfg.repo}`);
    } catch (e) {
      token = null;
      throw new Error(`Cannot open the data repo ${cfg.owner}/${cfg.repo}. Ask the owner to add you and give the token access to it.`);
    }
    if (!repo.private) {
      token = null;
      throw new Error("The data repo is PUBLIC. Make it Private before using this app.");
    }
    if (!(repo.permissions && repo.permissions.push)) {
      token = null;
      throw new Error("Your token can only read. It needs Contents: Read and write on the data repo.");
    }
    return { login: u.login, name: u.name || u.login };
  }

  function disconnect() { token = null; }

  async function loadAll() {
    const top = await gql(Q_TREE, { e: cfg.branch + ":data" });
    const entries = (top.repository && top.repository.object && top.repository.object.entries) || [];
    const months = entries.filter((e) => e.type === "tree" && /^\d{4}-\d{2}$/.test(e.name)).map((e) => e.name).sort();
    const parts = await Promise.all(months.map(async (m) => {
      const d = await gql(Q_FILES, { e: `${cfg.branch}:data/${m}` });
      const ents = (d.repository && d.repository.object && d.repository.object.entries) || [];
      const out = [];
      for (const en of ents) {
        if (!en.name.endsWith(".json") || !en.object || !en.object.text) continue;
        try {
          const rec = cleanRecord(en.object.text, en.object.oid, `data/${m}/${en.name}`);
          if (rec && en.name === rec.id + ".json") out.push(rec);
        } catch (e) { /* skip unreadable file */ }
      }
      return out;
    }));
    return [].concat(...parts).sort((a, b) => (a.dispatch_dt < b.dispatch_dt ? 1 : a.dispatch_dt > b.dispatch_dt ? -1 : a.id < b.id ? 1 : -1));
  }

  async function nextSeq(day, month) {
    let names = [];
    try {
      const list = await req("GET", `/repos/${cfg.owner}/${cfg.repo}/contents/data/${month}?ref=${encodeURIComponent(cfg.branch)}`);
      names = list.map((x) => x.name);
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    const prefix = `YR-${day}-`;
    let n = 0;
    for (const nm of names) if (nm.startsWith(prefix)) n = Math.max(n, parseInt(nm.slice(prefix.length, prefix.length + 3), 10) || 0);
    return n;
  }

  // rec: fields without id/manifest_no/gatepass_no. Returns the saved record.
  async function createRecord(rec, userLabel, nowStr) {
    const day = rec.dispatch_dt.slice(0, 10).replace(/-/g, "");
    const month = rec.dispatch_dt.slice(0, 7);
    let seq = await nextSeq(day, month);
    for (let attempt = 0; attempt < 6; attempt++) {
      seq += 1;
      const suffix = `${day}-${String(seq).padStart(3, "0")}`;
      const full = Object.assign({}, rec, {
        id: "YR-" + suffix, manifest_no: "MF-" + suffix, gatepass_no: "GP-" + suffix,
        entry_time: "", exit_time: "", entry_by: "", exit_by: "",
        created_by: userLabel, created_at: nowStr,
      });
      const path = `data/${month}/${full.id}.json`;
      try {
        const res = await req("PUT", `/repos/${cfg.owner}/${cfg.repo}/contents/${path}`, {
          message: `Add manifest ${full.manifest_no} (${full.partner})`,
          content: b64(JSON.stringify(full, null, 2)),
          branch: cfg.branch,
        });
        full._sha = res.content.sha;
        full._path = path;
        return full;
      } catch (e) {
        if (e.status === 422 || e.status === 409) continue; // number taken by someone else, try the next
        throw e;
      }
    }
    throw new Error("Could not reserve a manifest number. Please try again.");
  }

  // Sets entry/exit time once. Re-reads the file first so nobody overwrites anyone.
  async function markGate(rec, which, userLabel, nowStr) {
    const tKey = which === "entry" ? "entry_time" : "exit_time";
    const bKey = which === "entry" ? "entry_by" : "exit_by";
    for (let attempt = 0; attempt < 3; attempt++) {
      const f = await req("GET", `/repos/${cfg.owner}/${cfg.repo}/contents/${rec._path}?ref=${encodeURIComponent(cfg.branch)}`);
      const cur = cleanRecord(unb64(f.content), f.sha, rec._path);
      if (!cur) throw new Error("Record is damaged.");
      if (cur[tKey]) return { record: cur, changed: false };
      cur[tKey] = nowStr;
      cur[bKey] = userLabel;
      const toSave = Object.assign({}, cur);
      delete toSave._sha; delete toSave._path;
      try {
        const res = await req("PUT", `/repos/${cfg.owner}/${cfg.repo}/contents/${rec._path}`, {
          message: `Gate ${which} ${cur.gatepass_no}`,
          content: b64(JSON.stringify(toSave, null, 2)),
          branch: cfg.branch,
          sha: f.sha,
        });
        cur._sha = res.content.sha;
        return { record: cur, changed: true };
      } catch (e) {
        if (e.status === 409 || e.status === 422) continue;
        throw e;
      }
    }
    throw new Error("Could not save, please try again.");
  }

  root.GH = { connect, disconnect, loadAll, createRecord, markGate, ID_RE };
})(typeof window !== "undefined" ? window : globalThis);
