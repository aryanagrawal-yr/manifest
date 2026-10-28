"""Tiny user store (data/users.json) + CLI.

  python users.py add <username> "<Full Name>" [admin|staff]
  python users.py list
  python users.py remove <username>
"""
import getpass
import json
import os
import sys

from werkzeug.security import check_password_hash, generate_password_hash

import storage

PATH = os.path.join(storage.DATA_DIR, "users.json")


def _load():
    if not os.path.exists(PATH):
        return {}
    with open(PATH) as f:
        return json.load(f)


def _save(d):
    os.makedirs(storage.DATA_DIR, exist_ok=True)
    with open(PATH, "w") as f:
        json.dump(d, f, indent=2)
    try:
        os.chmod(PATH, 0o600)
    except OSError:
        pass


def verify(username, password):
    u = _load().get((username or "").strip().lower())
    if u and check_password_hash(u["hash"], password or ""):
        return {"username": username.strip().lower(), "name": u["name"], "role": u.get("role", "staff")}
    return None


def has_users():
    return bool(_load())


def add(username, name, role="staff", password=None):
    d = _load()
    d[username.strip().lower()] = {
        "name": name,
        "role": role,
        "hash": generate_password_hash(password),
    }
    _save(d)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        print(__doc__)
    elif a[0] == "add" and len(a) >= 3:
        pw = getpass.getpass("Password: ")
        if len(pw) < 8:
            sys.exit("Use at least 8 characters.")
        add(a[1], a[2], a[3] if len(a) > 3 else "staff", pw)
        print("Saved user", a[1])
    elif a[0] == "list":
        for k, v in _load().items():
            print(k, "-", v["name"], "(%s)" % v.get("role", "staff"))
    elif a[0] == "remove" and len(a) == 2:
        d = _load()
        d.pop(a[1].strip().lower(), None)
        _save(d)
        print("Removed", a[1])
    else:
        print(__doc__)
