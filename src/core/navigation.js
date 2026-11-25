export const navigation = [
  {
    id: "system", label: "سیستم", icon: "⚙", children: [
      ["/system/factories", "کارخانه‌ها", "▦"],
      ["/system/users", "کاربران", "♙"],
      ["/system/edge", "وضعیت Edge", "♡"],
      ["/system/edge/register", "ثبت Edge", "⌁"],
      ["/system/storage", "مرکز داده", "◉"]
    ]
  },
  {
    id: "bi", label: "هوش تجاری (BI)", icon: "◷", children: [
      ["/bi/dashboard", "داشبورد مدیریتی BI", "▥"]
    ]
  },
  {
    id: "equipment", label: "تجهیزات", icon: "▣", children: [
      ["/equipment/plcs", "PLC ها", "⚙"],
      ["/equipment/tags", "تگ‌ها", "◇"]
    ]
  },
  {
    id: "live", label: "نمایش زنده", icon: "⌁", children: [
      ["/live/data", "داده زنده", "⌁"],
      ["/live/hmi-pages", "صفحات HMI", "▦"],
      ["/live/hmi-designer/new", "طراح شماتیک صنعتی", "▧"],
      ["/live/classic", "HMI کلاسیک", "♧"],
      ["/live/alarms", "آلارم‌ها", "◴"],
      ["/live/trends", "روند", "⌁"]
    ]
  },
  {
    id: "reports", label: "گزارش و فرآیند", icon: "▤", children: [
      ["/reports/list", "گزارش‌ها", "▧"],
      ["/reports/processes", "فرآیندها", "▤"]
    ]
  },
  {
    id: "workflow", label: "گردش کار و تأیید", icon: "☷", children: [
      ["/workflow/inbox", "کارتابل من", "✉"],
      ["/workflow/templates", "قالب‌های گردشکار", "⇄"]
    ]
  },
  {
    id: "planning", label: "برنامه‌ریزی تولید", icon: "▦", children: [
      ["/planning/board", "تابلوی برنامه‌ریزی", "▦"],
      ["/planning/calendar", "تقویم ماشین‌ها", "▦"],
      ["/planning/operator", "ایستگاه اپراتور", "▣"],
      ["/planning/units", "واحدهای تولید", "⬡"],
      ["/planning/orders", "داشبورد سفارش‌ها", "◉"]
    ]
  },
  {
    id: "quality", label: "کنترل کیفیت", icon: "♧", children: [
      ["/quality/dashboard", "داشبورد کیفیت", "▥"],
      ["/quality/pending", "در انتظار بررسی", "▣"],
      ["/quality/history", "سوابق کیفیت", "◴"],
      ["/quality/plan", "طرح کنترل", "☷"]
    ]
  },
  {
    id: "production", label: "ماژول تولید", icon: "▥", children: [
      ["/production/run", "اجرا", "▥"],
      ["/production/machines", "ماشین‌ها و خطوط", "⚒"],
      ["/production/config", "پیکربندی کارخانه", "⚙"],
      ["/production/prices", "قیمت‌ها و تعرفه‌ها", "＄"],
      ["/production/report", "گزارش تولید", "▧"]
    ]
  },
  {
    id: "batch", label: "توزین (بچ)", icon: "♧", children: [
      ["/batch/run", "اجرا", "▥"],
      ["/batch/setup", "تنظیم", "⚒"],
      ["/batch/report", "گزارش بچ", "▧"],
      ["/batch/compare", "مقایسه بچ", "⌁"]
    ]
  }
];

export const routeTitles = Object.fromEntries(
  navigation.flatMap(group => group.children.map(([path, label]) => [path, label]))
);

export function findGroup(path) {
  return navigation.find(group => group.children.some(([route]) => route === path))?.id ?? "system";
}
