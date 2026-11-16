from __future__ import annotations

import uuid

from .database import connect, json_dump, utc_now
from .security import hash_password


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


def seed_database() -> None:
    now = utc_now()
    with connect() as db:
        user_count = db.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if user_count:
            return
        db.execute(
            """INSERT INTO users(id,email,name,role,status,password_hash,must_change_password,created_at,updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)""",
            ("u-admin", "admin@demo-cable.local", "مدیر سامانه", "Organization Admin", "فعال",
             hash_password("demo1234"), 0, now, now),
        )

        seed = {
            "factories": [
                {"id":"f1","name":"کارخانه کابل - دمو","code":"DEMO-CABLE","status":"فعال","edge":"EDGE-LOCAL-001","plcs":1},
                {"id":"f2","name":"تست ارسال به PLC","code":"PLC-TEST","status":"فعال","edge":"EDGE-LOCAL-001","plcs":1},
                {"id":"f3","name":"کارخانه نمونه","code":"FACTORY-03","status":"غیرفعال","edge":"—","plcs":0},
            ],
            "plcs": [
                {"id":"p1","name":"PLC شبیه‌ساز کارخانه کابل","protocol":"simulator","address":"127.0.0.1:1502","unit":"60","poll":"500 ms","active":"بله","status":"CONNECTED","factory_id":"f1"}
            ],
            "tags": [
                {"id":"t1","name":"BN.Cmd.Start","plc":"p1","type":"bool","address":"00014","access":"read_write","unit":"","value":False,"factory_id":"f1"},
                {"id":"t2","name":"BN.Cmd.Stop","plc":"p1","type":"bool","address":"00015","access":"read_write","unit":"","value":False,"factory_id":"f1"},
                {"id":"t3","name":"BN.Current","plc":"p1","type":"float32","address":"40045","access":"read","unit":"A","value":180.3366,"factory_id":"f1"},
                {"id":"t4","name":"BN.Enable","plc":"p1","type":"bool","address":"00013","access":"read_write","unit":"","value":True,"factory_id":"f1"},
                {"id":"t5","name":"BN.Energy","plc":"p1","type":"float32","address":"40043","access":"read","unit":"kWh","value":21879.416,"factory_id":"f1"},
                {"id":"t6","name":"BN.Speed","plc":"p1","type":"float32","address":"40035","access":"read","unit":"m/min","value":119.2585,"factory_id":"f1"},
                {"id":"t7","name":"BN.SpeedSet","plc":"p1","type":"float32","address":"40037","access":"read_write","unit":"m/min","value":120.0,"factory_id":"f1"},
                {"id":"t8","name":"BN.Tension","plc":"p1","type":"float32","address":"40049","access":"read","unit":"N","value":125.4806,"factory_id":"f1"},
            ],
            "alarms": [],
            "trends": [
                {"id":"tr1","name":"سرعت ماشین‌های خط","tags":"BN.Speed, CP.Speed, IX.Speed","period":"۵ دقیقه","status":"فعال"},
                {"id":"tr2","name":"دمای زون‌های اکسترودر","tags":"IX.Z1, IX.Z2, IX.Z3, IX.Z4","period":"۱ دقیقه","status":"فعال"},
                {"id":"tr3","name":"قطر خارجی و فشار مذاب","tags":"IX.OD, IX.Melt","period":"۵ دقیقه","status":"فعال"},
            ],
            "reports": [
                {"id":"rp1","name":"پایش دمای اکسترودرها (ساعتی)","type":"ساعتی","tags":10,"status":"فعال"},
                {"id":"rp2","name":"سرعت و توان ماشین‌ها (ساعتی)","type":"ساعتی","tags":7,"status":"فعال"},
                {"id":"rp3","name":"گزارش روزانه انرژی و تأسیسات","type":"روزانه","tags":4,"status":"فعال"},
            ],
            "processes": [
                {"id":"pr1","name":"ثبت قرقره تکمیل‌شده","code":"REEL_COMPLETED","status":"فعال","fields":5},
                {"id":"pr2","name":"کنترل کیفیت اکستروژن","code":"EXTRUSION_QC","status":"فعال","fields":6},
            ],
            "templates": [
                {"id":"wf1","name":"تأیید نهایی و بستن سفارش","steps":["تأیید مدیر تولید","تأیید کنترل کیفیت"],"status":"پیش‌فرض"},
                {"id":"wf2","name":"تأیید و آزادسازی سفارش تولید","steps":["برنامه‌ریزی تولید","بررسی کنترل کیفیت","تخصیص ماشین و اپراتور"],"status":"پیش‌فرض"},
            ],
            "orders": [
                {"id":"o1","code":"PO-1405-000012","product":"کابل قدرت NYY 4×16mm²","quantity":"1000000","unit":"m","status":"در حال تولید","progress":46},
                {"id":"o2","code":"PO-1405-000011","product":"سیم افشان H07V-K 4mm²","quantity":"1000000","unit":"m","status":"آزادشده","progress":0},
                {"id":"o3","code":"PO-1405-000010","product":"سیم 1×10 افشان","quantity":"1000000","unit":"m","status":"آزادشده","progress":0},
                {"id":"o4","code":"PO-1405-000009","product":"سیم 1×10 افشان","quantity":"1000000","unit":"m","status":"آزادشده","progress":0},
            ],
            "units": [
                {"id":"un1","code":"RL-1405-000013","quantity":"72.0000","unit":"m","status":"بسته"},
                {"id":"un2","code":"RL-1405-000012","quantity":"500.0000","unit":"m","status":"بسته"},
                {"id":"un3","code":"RL-1405-000011","quantity":"500.0000","unit":"m","status":"بسته"},
                {"id":"un4","code":"RL-1405-000010","quantity":"500.0000","unit":"m","status":"بسته"},
            ],
            "qc": [
                {"id":"qc1","code":"QC-CB-001148","product":"سیم 1×10 افشان","machine":"اکسترودر عایق","decision":"قبول","inspector":"کارشناس کیفیت","time":"امروز · ۱۰:۴۵","status":"بررسی‌شده"},
                {"id":"qc2","code":"QC-CB-001147","product":"کابل قدرت NYY 4×16","machine":"کابل‌کشی","decision":"مشروط","inspector":"کارشناس کیفیت","time":"امروز · ۰۹:۳۵","status":"بررسی‌شده"},
                {"id":"qc3","code":"QC-CB-001146","product":"سیم افشان H07V-K","machine":"بانچر","decision":"قبول","inspector":"کارشناس کیفیت","time":"دیروز · ۱۶:۲۰","status":"بررسی‌شده"},
            ],
            "batches": [],
            "productionRuns": [],
            "workflowTasks": [
                {"id":"task-1","title":"تأیید نهایی سفارش PO-1405-000012","flow":"تأیید نهایی و بستن سفارش","from":"برنامه‌ریزی تولید","date":"امروز · ۱۰:۵۵","priority":"عادی","status":"در انتظار"},
                {"id":"task-2","title":"بررسی نتایج کنترل کیفیت اکستروژن","flow":"تأیید و آزادسازی سفارش تولید","from":"کنترل کیفیت","date":"امروز · ۰۹:۳۰","priority":"بالا","status":"در انتظار"},
                {"id":"task-3","title":"آزادسازی برنامه تولید شیفت عصر","flow":"تأیید برنامه تولید","from":"مدیر تولید","date":"دیروز · ۱۵:۲۰","priority":"عادی","status":"تکمیل‌شده"},
            ],
            "products": [
                {"id":"prod1","code":"CB-001","name":"کابل قدرت NYY 4×16mm²","unit":"m","status":"فعال"},
                {"id":"prod2","code":"WR-010","name":"سیم 1×10 افشان","unit":"m","status":"فعال"},
                {"id":"prod3","code":"WR-004","name":"سیم افشان H07V-K 4mm²","unit":"m","status":"فعال"},
            ],
            "machines": [
                {"id":"m1","name":"کشش مفتول راد","code":"RBD-01","status":"متصل"},
                {"id":"m2","name":"مولتی‌وایر","code":"MWD-01","status":"متصل"},
                {"id":"m3","name":"بانچر","code":"BUN-01","status":"متصل"},
                {"id":"m4","name":"اکسترودر عایق","code":"EXI-01","status":"متصل"},
                {"id":"m5","name":"کابل‌کشی","code":"LAY-01","status":"متصل"},
                {"id":"m6","name":"قرقره‌پیچ","code":"CPK-01","status":"متصل"},
            ],
            "prices": [
                {"id":"price-cu","kind":"مواد اولیه","code":"CU-01","name":"مفتول مس","price":980000,"currency":"ریال","unit":"kg","valid_from":"1405-08-01","status":"فعال"},
                {"id":"price-pvc","kind":"مواد اولیه","code":"PVC-01","name":"گرانول PVC","price":280000,"currency":"ریال","unit":"kg","valid_from":"1405-08-01","status":"فعال"},
                {"id":"energy-off","kind":"تعرفه انرژی","code":"ELEC-OFF","name":"برق کم‌باری","price":1200,"currency":"ریال","unit":"kWh","valid_from":"1405-08-01","status":"فعال"},
                {"id":"energy-mid","kind":"تعرفه انرژی","code":"ELEC-MID","name":"برق میان‌باری","price":2400,"currency":"ریال","unit":"kWh","valid_from":"1405-08-01","status":"فعال"},
                {"id":"energy-peak","kind":"تعرفه انرژی","code":"ELEC-PEAK","name":"برق اوج بار","price":4800,"currency":"ریال","unit":"kWh","valid_from":"1405-08-01","status":"فعال"},
            ],
            "hmiPages": [
                {"id":"hmi-overview","name":"نمای کلی خط","machine":"همه ماشین‌ها","description":"نمای کلی وضعیت خط تولید","components":72,"status":"فعال"},
                {"id":"hmi-rbd","name":"کشش مفتول راد","machine":"کشش مفتول راد","description":"نمایش وضعیت کشش راد","components":54,"status":"فعال"},
                {"id":"hmi-mwd","name":"مولتی‌وایر","machine":"مولتی‌وایر","description":"نمایش وضعیت مولتی‌وایر","components":54,"status":"فعال"},
                {"id":"hmi-buncher","name":"بانچر","machine":"بانچر","description":"نمایش وضعیت بانچر","components":54,"status":"فعال"},
                {"id":"hmi-reel","name":"قرقره‌پیچ","machine":"قرقره‌پیچ","description":"نمایش وضعیت قرقره‌پیچ","components":54,"status":"فعال"},
                {"id":"hmi-extruder","name":"اکسترودر عایق","machine":"اکسترودر عایق","description":"نمایش وضعیت اکسترودر","components":72,"status":"فعال"},
                {"id":"hmi-strander","name":"استرندر","machine":"استرندر","description":"نمایش وضعیت استرندر","components":54,"status":"فعال"},
                {"id":"hmi-energy","name":"انرژی و تأسیسات","machine":"تأسیسات","description":"نمایش انرژی و تأسیسات","components":72,"status":"فعال"},
            ],
            "machineCalendars": [
                {"id":"cal-rbd","machine":"کشش مفتول راد","year":"1405","month":"آبان","days":[{"day":"شنبه","enabled":True,"start":"08:00","end":"17:00","break":"01:00"},{"day":"یکشنبه","enabled":True,"start":"08:00","end":"17:00","break":"01:00"},{"day":"دوشنبه","enabled":True,"start":"08:00","end":"17:00","break":"01:00"},{"day":"سه‌شنبه","enabled":True,"start":"08:00","end":"17:00","break":"01:00"},{"day":"چهارشنبه","enabled":True,"start":"08:00","end":"17:00","break":"01:00"},{"day":"پنجشنبه","enabled":True,"start":"08:00","end":"13:00","break":"00:30"},{"day":"جمعه","enabled":False,"start":"08:00","end":"17:00","break":"01:00"}]},
            ],
            "batchConfigs": [
                {"id":"batch-config-1","code":"BATCH-01","name":"خط ترکیب مواد ۱","loadcell":"Loadcell-01","samples":5,"tolerance_percent":0.5,"stabilization_seconds":3,"formula":"کابل NYY 4×16","description":"فرمول پایه ترکیب مواد عایق","hoppers":[{"bin":"Hopper 01","material":"گرانول PVC","ratio":50,"target":250},{"bin":"Hopper 02","material":"کربنات کلسیم","ratio":30,"target":150},{"bin":"Hopper 03","material":"افزودنی","ratio":20,"target":100}]},
            ],
            "controlPlans": [
                {"id":"cp-cable-1","product":"سیم 1×10 افشان","process":"اکستروژن عایق","version":"نسخه ۱","sampling_interval":"هر ۳۰ دقیقه","sample_count":3,"responsible":"کارشناس کیفیت","approval_required":True,"parameters":[{"parameter":"قطر عایق","nominal":"۲٫۴۰","min":"۲٫۳۵","max":"۲٫۴۵","unit":"mm","method":"اندازه‌گیری"},{"parameter":"مقاومت هادی","nominal":"۱٫۸۳","min":"—","max":"۱٫۹۰","unit":"Ω/km","method":"آزمون الکتریکی"},{"parameter":"ضخامت عایق","nominal":"۰٫۸","min":"۰٫۷۵","max":"۰٫۸۵","unit":"mm","method":"اندازه‌گیری"},{"parameter":"ظاهر محصول","nominal":"بدون عیب","min":"—","max":"—","unit":"—","method":"بازرسی چشمی"}],"status":"فعال"},
            ],
        }
        for collection, records in seed.items():
            for record in records:
                record = dict(record)
                record_id = record.pop("id", _id(collection[:2]))
                factory_id = record.pop("factory_id", None)
                db.execute(
                    "INSERT INTO resources(collection,id,factory_id,payload,created_at,updated_at) VALUES(?,?,?,?,?,?)",
                    (collection, record_id, factory_id, json_dump(record), now, now),
                )
        db.execute(
            "INSERT INTO edge_devices(id,factory_id,name,status,metadata,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            ("edge-demo-001", "f1", "EDGE-LOCAL-001", "DEMO", json_dump({"source":"seed","note":"نمایشی - بدون heartbeat واقعی"}), now, now),
        )
