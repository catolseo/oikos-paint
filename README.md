# Oikos Expert Tint — колорант-калькулятор

Браузерный калькулятор формул колорантов на базе зашифрованной FoxPro-БД Oikos Expert Tint 9.70 (DCS 16C, 2023-02-03).

**Live**: включите GitHub Pages в настройках репозитория (Settings → Pages → Deploy from branch: `main` / `/`), URL будет `https://<user>.github.io/oikos-paint/`.

## Что делает

Выбираете продукт (INTERIOR / EXTERIOR) → подпродукт (KREOS, EXTRAPAINT, MARMORINO, RAL, NCS…) → цвет → объём в литрах. На выходе — таблица колорантов с каплями, миллилитрами и граммами, с учётом плотности каждого пигмента.

- 73 167 формул из 123 подпродуктов
- 16 колорантов системы COROB DCS 16C (GO, GR, MG, VL, BL, VR, VO, NO, GL, AR, RV, RS, RO, BM, NR, BN)
- 77 баз (P, M, D, TR, BIANCO, NP 3900 и т.д.)
- 1 капля = 31.246 / 192 ≈ 0.1627 мл (COROB 1/192 EU fl.oz.)

## Формула пересчёта

Каждая формула в БД задана для конкретной банки `CAN_ID` (с объёмом `NOM_Q`):

```
drops_scaled = formula_amount × target_volume_ml / can.ml
colorant_ml  = drops_scaled × drop_ml
colorant_g   = colorant_ml × colorant.density
```

## Структура

- `index.html`, `app.js`, `styles.css` — UI
- `data.js` — ядро (колоранты, базы, банки, каталог продуктов) ~13 KB
- `formulas/p1.js` — формулы INTERIOR (56 035 шт., 4 MB)
- `formulas/p2.js` — формулы EXTERIOR (17 132 шт., 1.2 MB)
- `tools/extract_dbf.py` — парсер `C:\GDATA\*.dbf` (dBase III, cp850) → JS

## Переэкспорт базы

При обновлении программы Oikos Expert Tint перегенерируйте данные:

```
python tools/extract_dbf.py
```

Требуется установленная Oikos Expert Tint (папка `C:\GDATA`).

## Исходные файлы БД

```
C:\GDATA\
  PRODUCTS.DBF           INTERIOR (PROD0001) / EXTERIOR (PROD0002)
  PROD0001\SUBPRODS.DBF  подпродукты категории
  BASES.DBF              базы (ID → CODE → DESCR)
  CANS.DBF               размеры банок
  CNTS.DBF               колоранты
  COLORKEY.DBF           20 794 цветовых кода (RAL, NCS, Oikos)
  <prod>\<subprod>\FRM.DBF  формулы
```

Поле `FRM.FORMULA` — строка вида `"cid,amount,cid,amount,…"` где `cid` — `CNTS.ID`, `amount` — количество единиц-долей (1 ед = `PRODUCTS.UNIT / PRODUCTS.FRACTION` мл).
