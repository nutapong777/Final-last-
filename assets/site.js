/* ตั้งค่าลิงก์ GitHub ของโปรเจกต์ (ใช้ร่วมกันทุกหน้า)
 * - เมื่ออยู่บน GitHub Pages (https://<user>.github.io/<repo>/) จะหา URL ของ repo ให้อัตโนมัติ
 * - ถ้าเปิดจากเครื่อง จะใช้ค่า FALLBACK ด้านล่าง → แก้เป็นลิงก์ repo ของตัวเองได้
 */
window.SITE = (function () {
  const FALLBACK = "https://github.com/nutapong777";
  let github = FALLBACK;
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/i);
  if (m) {
    const repo = location.pathname.split("/").filter(Boolean)[0];
    github = repo ? `https://github.com/${m[1]}/${repo}` : `https://github.com/${m[1]}`;
  }
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-github]").forEach((a) => {
      const sub = a.getAttribute("data-github");          // เช่น "blob/main/README.md"
      a.href = sub && m ? `${github}/${sub}` : github;
      a.target = "_blank"; a.rel = "noopener";
    });
  });
  return { github };
})();
