# -*- coding: utf-8 -*-
"""
เตรียมข้อมูลสำหรับเว็บ
Input : data/raw/accident2019raw.xlsx, data/cleaned/accident2019clean.xlsx
Output: data/raw/accident2019raw.csv            (UTF-8)
        data/cleaned/accident2019_cleaned.csv   (UTF-8)
        web/plotly/data/accidents.json          (UTF-8, แบบกะทัดรัดสำหรับเว็บ)
        web/plotly/data/accidents.js            (ข้อมูลเดียวกัน สำหรับเปิดไฟล์ตรงจากเครื่อง)
รันจากโฟลเดอร์หลักของ repo:  python scripts/prepare_web_data.py
"""
import json
import pandas as pd

REGION = {
    "เหนือ": ["เชียงราย", "เชียงใหม่", "น่าน", "พะเยา", "แพร่", "แม่ฮ่องสอน", "ลำปาง", "ลำพูน", "อุตรดิตถ์"],
    "ตะวันออกเฉียงเหนือ": ["กาฬสินธุ์", "ขอนแก่น", "ชัยภูมิ", "นครพนม", "นครราชสีมา", "บึงกาฬ", "บุรีรัมย์", "มหาสารคาม",
                           "มุกดาหาร", "ยโสธร", "ร้อยเอ็ด", "เลย", "ศรีสะเกษ", "สกลนคร", "สุรินทร์", "หนองคาย",
                           "หนองบัวลำภู", "อำนาจเจริญ", "อุดรธานี", "อุบลราชธานี"],
    "กลาง": ["กรุงเทพมหานคร", "กำแพงเพชร", "ชัยนาท", "นครนายก", "นครปฐม", "นครสวรรค์", "นนทบุรี", "ปทุมธานี", "อยุธยา",
             "พิจิตร", "พิษณุโลก", "เพชรบูรณ์", "ลพบุรี", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", "สิงห์บุรี",
             "สุโขทัย", "สุพรรณบุรี", "สระบุรี", "อ่างทอง", "อุทัยธานี"],
    "ตะวันออก": ["จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ตราด", "ปราจีนบุรี", "ระยอง", "สระแก้ว"],
    "ตะวันตก": ["กาญจนบุรี", "ตาก", "ประจวบคีรีขันธ์", "เพชรบุรี", "ราชบุรี"],
    "ใต้": ["กระบี่", "ชุมพร", "ตรัง", "นครศรีธรรมราช", "นราธิวาส", "ปัตตานี", "พังงา", "พัทลุง", "ภูเก็ต", "ระนอง",
            "สตูล", "สงขลา", "สุราษฎร์ธานี", "ยะลา"],
}
P2R = {p: r for r, ps in REGION.items() for p in ps}

raw = pd.read_excel("data/raw/accident2019raw.xlsx")
raw.to_csv("data/raw/accident2019raw.csv", index=False, encoding="utf-8")
df = pd.read_excel("data/cleaned/accident2019clean.xlsx")
df.to_csv("data/cleaned/accident2019_cleaned.csv", index=False, encoding="utf-8")

df["ภาค"] = df["จังหวัด"].map(P2R)
assert df["ภาค"].notna().all()
d = pd.to_datetime(df["วันที่เกิดเหตุ"])
t = pd.to_datetime(df["เวลา"].astype(str), format="%H:%M:%S")

cats = {
    "region": "ภาค", "province": "จังหวัด", "vehicle": "รถคันที่ 1", "cause": "มูลเหตุสันนิษฐาน",
    "weather": "สภาพอากาศ", "crash": "ลักษณะการเกิดอุบัติเหตุ", "road": "บริเวณที่เกิดเหตุ/ลักษณะทาง",
    "route": "สายทาง", "agency": "หน่วยงาน",
}
dicts, codes = {}, {}
for k, col in cats.items():
    vals = df[col].value_counts().index.tolist()          # เรียงตามความถี่
    dicts[k] = vals
    idx = {v: i for i, v in enumerate(vals)}
    codes[k] = df[col].map(idx).astype(int).tolist()

fields = ["month", "day", "dow", "hour", "minute"] + list(cats) + ["deaths", "injuries", "vehicles", "lat", "lon"]
rows = list(zip(d.dt.month, d.dt.day, d.dt.dayofweek, t.dt.hour, t.dt.minute,
                *[codes[k] for k in cats],
                df["จำนวนผู้เสียชีวิต"], df["รวมจำนวนผู้บาดเจ็บ"], df["จำนวนรถที่เกิดเหตุ (รวมคันที่ 1)"],
                df["LATITUDE"].round(5), df["LONGITUDE"].round(5)))
rows = [[int(x) if i < len(fields) - 2 else float(x) for i, x in enumerate(r)] for r in rows]
out = {"source": "กระทรวงคมนาคม (TRAMS) — datagov.mot.go.th/dataset/roadaccident",
       "year": 2019, "fields": fields, "dicts": dicts, "rows": rows}
with open("web/plotly/data/accidents.json", "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
# เวอร์ชัน .js (ข้อมูลเดียวกัน) ให้เปิด index.html ตรงจากเครื่องได้ (file://) โดยไม่ต้องใช้ server
with open("web/plotly/data/accidents.js", "w", encoding="utf-8") as f:
    f.write("window.ACCIDENT_DATA = ")
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print(len(rows), "rows ->", "web/plotly/data/accidents.json + accidents.js")
