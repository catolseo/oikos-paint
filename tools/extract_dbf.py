"""Extract Oikos Expert Tint database (C:\\GDATA) into data.js + per-product formula files.

dBase III (.dbf) structure in C:\\GDATA:
  PRODUCTS.DBF        INTERIOR (PROD0001) / EXTERIOR (PROD0002)
  PROD000N/SUBPRODS.DBF   paint subproducts
  BASES.DBF           base IDs (e.g. 7=BASE P, 8=BASE M, 10=BASE D)
  CANS.DBF            can sizes (1 LT, 2.25 LT, 4 LT, ...)
  CNTS.DBF            16 colorants (GO, GR, MG, VL, BL, VR, VO, NO, ...)
  COLORKEY.DBF        20794 color codes (RAL, NCS, Oikos, ...)
  <prod>/<subprod>/FRM.DBF    actual formulas

FRM.FORMULA is "cid,amount,cid,amount,..." where amount is in drop-subdivision units.
drop_ml = PRODUCTS.UNIT / PRODUCTS.FRACTION (≈ 0.1627 ml for OIKOS DCS 16C).
Each formula is valid for a specific CAN_ID. Scale drops by V_requested / can.NOM_Q.

Output:
  data.js              core tables + product catalog (~15 KB)
  formulas/p<N>.js     formulas for product N (one file per INTERIOR / EXTERIOR)

The formula files use a compact flat array format to keep the payload small:
  [prd, spd, key1, key3, base, can, "cid,amt,cid,amt,...", r, g, b]
"""

import json
import os
import struct
import sys

GDATA = r"C:\GDATA"
ENCODING = "cp850"
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def read_dbf(path):
    with open(path, "rb") as f:
        data = f.read()
    records = struct.unpack("<I", data[4:8])[0]
    header_size = struct.unpack("<H", data[8:10])[0]
    record_size = struct.unpack("<H", data[10:12])[0]
    fields = []
    pos = 32
    while data[pos] != 0x0D:
        name = data[pos : pos + 11].rstrip(b"\x00").decode("ascii")
        ftype = chr(data[pos + 11])
        flen = data[pos + 16]
        fields.append((name, ftype, flen))
        pos += 32
    out = []
    pos = header_size
    for _ in range(records):
        if data[pos] == 0x2A:
            pos += record_size
            continue
        rec, p = {}, pos + 1
        for name, _, flen in fields:
            raw = data[p : p + flen]
            try:
                rec[name] = raw.decode(ENCODING).strip()
            except UnicodeDecodeError:
                rec[name] = raw.hex()
            p += flen
        out.append(rec)
        pos += record_size
    return out


def num(v, default=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def rgb_int(r):
    rr, gg, bb = int(num(r["R_MON"])), int(num(r["G_MON"])), int(num(r["B_MON"]))
    if rr < 0 or gg < 0 or bb < 0:
        return None
    return [rr & 0xFF, gg & 0xFF, bb & 0xFF]


def compact_formula(f):
    parts = f.split(",")
    pairs = []
    for i in range(0, len(parts) - 1, 2):
        cid = parts[i].strip()
        amt = parts[i + 1].strip()
        if not cid or not amt:
            continue
        try:
            a = float(amt)
        except ValueError:
            continue
        if a <= 0:
            continue
        a_str = str(int(a)) if a.is_integer() else str(a)
        pairs.append(f"{cid}:{a_str}")
    return ";".join(pairs)


def write_js(path, var_assign, obj):
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Auto-generated from C:\\GDATA by tools/extract_dbf.py. Do not edit.\n")
        f.write(f"{var_assign} = ")
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")


def main():
    products = read_dbf(os.path.join(GDATA, "PRODUCTS.DBF"))
    cans = {r["ID"]: r for r in read_dbf(os.path.join(GDATA, "CANS.DBF"))}
    bases = {r["ID"]: r for r in read_dbf(os.path.join(GDATA, "BASES.DBF"))}
    cnts = {r["ID"]: r for r in read_dbf(os.path.join(GDATA, "CNTS.DBF"))}

    drop_ml = num(products[0]["UNIT"]) / num(products[0]["FRACTION"])

    out_colorants = [
        {
            "id": cid,
            "code": c["CODE"],
            "descr": c["DESCR"],
            "hex": "#%02x%02x%02x" % (int(num(c["R_MON"])) & 0xFF, int(num(c["G_MON"])) & 0xFF, int(num(c["B_MON"])) & 0xFF),
            "density": num(c["SPEC_W"]) / 1000 or None,
        }
        for cid, c in sorted(cnts.items(), key=lambda x: int(x[0]))
    ]

    out_bases = {
        bid: {"code": b["CODE"], "descr": b["DESCR"]} for bid, b in bases.items()
    }

    out_cans = {
        cid: {"descr": c["DESCR"], "ml": num(c["NOM_Q"])} for cid, c in cans.items()
    }

    product_catalog = []
    os.makedirs(os.path.join(OUT_DIR, "formulas"), exist_ok=True)

    total_formulas = 0
    for prd in products:
        prd_id = prd["ID"]
        sp_path = os.path.join(GDATA, prd["PATH"], "SUBPRODS.DBF")
        subprods = read_dbf(sp_path) if os.path.exists(sp_path) else []

        catalog_sps = []
        product_formulas = []
        for sp in subprods:
            frm_path = os.path.join(GDATA, prd["PATH"], sp["PATH"], "FRM.DBF")
            if not os.path.exists(frm_path):
                continue
            sp_formula_count = 0
            for r in read_dbf(frm_path):
                cf = compact_formula(r["FORMULA"])
                if not cf:
                    continue
                rgb = rgb_int(r)
                product_formulas.append(
                    [
                        sp["ID"],
                        r["KEY1"],
                        r["KEY3"],
                        r["BASE_ID"],
                        r["CAN_ID"],
                        cf,
                        rgb,
                    ]
                )
                sp_formula_count += 1
            if sp_formula_count > 0:
                catalog_sps.append(
                    {"id": sp["ID"], "code": sp["CODE"], "descr": sp["DESCR"], "n": sp_formula_count}
                )

        product_catalog.append(
            {"id": prd_id, "code": prd["CODE"], "descr": prd["DESCR"], "subproducts": catalog_sps}
        )

        out_path = os.path.join(OUT_DIR, "formulas", f"p{prd_id}.js")
        write_js(out_path, f"window.OIKOS_FORMULAS_P{prd_id}", product_formulas)
        print(f"  p{prd_id}.js: {len(product_formulas):,} formulas, {os.path.getsize(out_path):,} bytes")
        total_formulas += len(product_formulas)

    core = {
        "version": "OIKOS DCS 16C 03-02-2023",
        "drop_ml": drop_ml,
        "colorants": out_colorants,
        "bases": out_bases,
        "cans": out_cans,
        "products": product_catalog,
    }
    core_path = os.path.join(OUT_DIR, "data.js")
    write_js(core_path, "window.OIKOS_DATA", core)
    print(f"data.js: {os.path.getsize(core_path):,} bytes")
    print(f"Total formulas: {total_formulas:,}")


if __name__ == "__main__":
    main()
