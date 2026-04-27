# Oikos Expert Tint — веб-калькулятор колорантов

Браузерный калькулятор формул на базе Oikos Expert Tint 9.70 (**COROB DCS 16C** 03-02-2023). Выбираете продукт, цвет и нужный объём (в литрах или килограммах) — получаете количество капель, миллилитров и граммов каждого колоранта.

**Live**: <https://catolseo.github.io/oikos-paint/>

---

## Что это такое

**Oikos Expert Tint** — профессиональное ПО итальянского производителя декоративных красок [Oikos](https://www.oikos-paint.com/) («Green since 1984») для колеровочных машин на базе технологии [COROB](https://www.corob.com/) (с 2018 г. в составе Graco Inc., мировой лидер в автоматической колеровке с 1984 г.).

Программа работает по связке:

1. Оператор выбирает **продукт** (например, MARMORINO NATURALE, KREOS, EXTRAPAINT) и **цвет** (RAL, NCS, собственные коллекции Oikos).
2. ПО обращается к зашифрованной FoxPro-БД и подбирает **формулу** — сколько долей каждого колоранта нужно на стандартную банку.
3. Формула передаётся в диспенсер COROB (например, T500 Automatic Turntable), который точно отмеряет колоранты по каплям (1 капля ≈ 1/192 EU fl.oz. для DCS-16C).

## COROB DCS 16C — система из 16 колорантов

Oikos использует 16-колорантовую комплектацию COROB (Dispensing Colorant System 16 Colors). Это универсальные водные пасты:

| Код | Название (IT)        | Перевод                    |
|-----|----------------------|----------------------------|
| GO  | GIALLO OSSIDO        | Жёлтый оксидный            |
| GR  | GIALLO ORO           | Жёлтый золотой             |
| MG  | MAGENTA              | Маджента                   |
| VL  | VIOLA                | Фиолетовый                 |
| BL  | BLU                  | Синий                      |
| VR  | VERDE                | Зелёный                    |
| VO  | VERDE OSSIDO         | Зелёный оксидный           |
| NO  | NERO OSSIDO          | Чёрный оксидный            |
| GL  | GIALLO LIMONE        | Лимонно-жёлтый             |
| AR  | ARANCIO              | Оранжевый                  |
| RV  | ROSSO VIVO           | Красный яркий              |
| RS  | ROSSO                | Красный                    |
| RO  | ROSSO OSSIDO         | Красный оксидный           |
| BM  | BLU MARE             | Морской синий              |
| NR  | NERO                 | Чёрный                     |
| BN  | BIANCO               | Белый                      |

## Что достаётся из оригинальной БД

```
C:\GDATA\
  FVERS.DAT                  «9.70  OIKOS DCS 16C 03-02-2023»
  PRODUCTS.DBF               INTERIOR (PROD0001) / EXTERIOR (PROD0002)
  PROD000N\SUBPRODS.DBF      123 подпродукта: MARMORINO, KREOS, EX2019, …
  BASES.DBF                  77 баз (P, M, D, TR, BIANCO, NP 3900, …)
  CANS.DBF                   19 размеров: 0.25/0.5/0.75/1/2.25/2.5/4/5/10/12/13.5/14/15 LT, 1/2.5/5/15/20/25 KG
  CNTS.DBF                   16 колорантов DCS 16C
  COLORKEY.DBF               20 794 цветовых кода (RAL, NCS, CC SOFT/MEDIUM, CC SPECIAL, COLLEZIONE COLORE, …)
  <prod>\<subprod>\FRM.DBF   формулы (73 167 записей суммарно)
```

Формат поля `FRM.FORMULA` — строка `"cid1,amount1,cid2,amount2,..."`, где:
- `cid` — `CNTS.ID` (номер колоранта 1–17)
- `amount` — количество долей; 1 доля = `PRODUCTS.UNIT / PRODUCTS.FRACTION` = 31.246 / 192 ≈ **0.1627 мл**

CIE XYZ (D65) в полях `X_02, Y_02, Z_02` покрывает 99.95% формул и конвертируется в sRGB для визуализации цвета.

## Математика пересчёта

Строго по COROB: формула жёстко привязана к конкретной банке через `CAN_ID`. Банка бывает объёмная (`1 LT`, `14 LT`, `10 LT`…) или массовая (`20 KG`, `5 KG`, `1 KG`…). Плотность базы в расчёте **не используется** — `BASES.SPEC_W` в БД у всех 77 баз равно 1000 (заглушка-вода) и реальной плотности там нет, потому что COROB-машина работает по объёму капель и не нуждается в массе базы.

```
factor = target / can.amount

drops_out     = formula_amount × factor
ml_of_tint    = drops_out × drop_ml              # drop_ml = 0.1627 мл
grams_of_tint = ml_of_tint × colorant_density    # CNTS.SPEC_W (только колоранта)
```

Единицы запроса должны совпадать с типом банки:
- объёмная банка → ввод в **литрах** или **миллилитрах**
- массовая банка → ввод в **килограммах** или **граммах**

Кросс-конверсия (литры в массовую формулу или кг в объёмную) **не выполняется** — это требовало бы плотности базы, которой нет ни в БД, ни в логике COROB-дозатора.

## Структура статистики

- **123 подпродукта**: COPRIMAX, EXTRAPAINT, KREOS, MARMORINO NATURALE/FINE, BIAMAX 03/07, FLEXIGRAP, SUPERMATT, DECORSIL (BOLOGNA/FIRENZE/ROMA/VENEZIA), BIOCOMPACT и др.
- **73 167 формул**: 56 035 INTERIOR + 17 132 EXTERIOR
- **25 коллекций цветов**: CC TONALITÀ DAL BIANCO, CC SOFT/MEDIUM, CC SPECIAL, COLLEZIONE COLORE, RAL, NCS, FUORI FASCIA, PREZZO DEDICATO, MEDIUM, SOFT, SPECIAL…
- Распределение по банкам: 33.5% на 10 л, 23.0% на 14 л, 14.9% на 1 л, 13.7% на 2.25 л, 9.7% на 4 л; массовые (1/20 кг) — 4.4%.

## Архитектура приложения

```
index.html    UI: селекторы, поиск, форма расчёта
app.js        вся логика (~220 строк vanilla JS)
styles.css    оформление + плавная смена фона на цвет формулы
data.js       ядро (~13 KB): колоранты, базы, банки, каталог подпродуктов
formulas/
  p1.js       формулы INTERIOR (56 035 шт., ~4.6 MB)
  p2.js       формулы EXTERIOR (17 132 шт., ~1.3 MB)
tools/
  extract_dbf.py   парсер dBase III (cp850) → JS
```

Файлы формул подгружаются лениво, по выбору категории. Версия базы подставляется в URL `?v=...` как cache-buster.

## Как пользоваться

1. **Категория**: INTERIOR или EXTERIOR.
2. **Продукт**: выберите из выпадающего списка (поиск по коду/описанию — `MARMORINO`, `KREOS`, `EX2019` и т.д.).
3. **Коллекция** и **Поиск по коду**: сузьте список из 20 000+ цветов (например, `RAL 2003` или `B 1005`).
4. **Цвет**: при выборе фон страницы меняется на реальный оттенок.
5. **Количество + Единица**: единицы автоматически подбираются по типу банки в формуле — литры/мл для объёмных, кг/г для массовых.
6. **Рассчитать** → таблица: капли / мл / граммы каждого колоранта + база и размер исходной банки формулы.

## Перегенерация БД

Если обновилась оригинальная программа Oikos Expert Tint:

```
python tools/extract_dbf.py
git add -A && git commit -m "Update formulas" && git push
```

Требуется установленная Oikos Expert Tint (папка `C:\GDATA`) и Python 3.8+. Парсер читает dBase III напрямую, без сторонних зависимостей.

## Лицензия и источник данных

Формулы принадлежат Oikos Srl (Италия). Этот репозиторий — инструмент-калькулятор для уже приобретённой/лицензированной базы. База в репозитории извлечена из дистрибутива «Expert Tint 10.0 Marzo 2023».

## Полезные ссылки

- [Oikos Paint](https://www.oikos-paint.com/) — производитель красок
- [COROB](https://www.corob.com/) — платформа колеровочных машин
- [Corob Interface Notes — Setting Colorant Ids](https://www.xrite.com/service-support/corob_interface_notes__setting_colorant_ids) — описание COROB colorant ID
- [CorobTECH 2.0 User Manual](https://www.scribd.com/doc/202793492/CorobTECH-2-0-User-Manual-English) — сервисное руководство
