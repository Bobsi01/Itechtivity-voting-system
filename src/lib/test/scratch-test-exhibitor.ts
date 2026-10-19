import puppeteer from "puppeteer-core";
import prisma from "@/lib/db/prisma";
import { encodeStubPayload, getVerifiedHmacSecret } from "@/lib/crypto/stub-tokens";

async function run() {
  const hmacSecret = getVerifiedHmacSecret();
  const stub = await prisma.ticketStub.findFirst({
    where: { status: "ACTIVATED", slotNumber: 1 },
    include: { bingoCard: true },
  });
  console.log("Target stub:", stub?.stubSerial);

  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  });

  const page = await browser.newPage();
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("requestfailed", (req) => console.log("REQ FAILED:", req.url(), req.failure()?.errorText));
  page.on("response", async (res) => {
    if (res.url().includes("/api/")) {
      const text = await res.text().catch(() => "");
      console.log(`API [${res.status()}] ${res.url()} ->`, text);
    }
  });

  await page.goto("http://localhost:3000/login", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const boothBtn = btns.find((b) => b.textContent?.includes("Booth CS-01"));
    boothBtn?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('button[type="submit"]');
  await page.waitForFunction(() => window.location.pathname.startsWith("/exhibitor"), { timeout: 15000 });
  console.log("Logged in to /exhibitor");

  await new Promise((r) => setTimeout(r, 1000));

  // Open manual stub entry
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const manualBtn = btns.find((b) => b.textContent?.includes("Manual Stub Entry"));
    manualBtn?.click();
  });
  await new Promise((r) => setTimeout(r, 500));

  const validQrPayload = encodeStubPayload(stub!.stubSerial, 1, hmacSecret);
  console.log("Valid QR payload:", validQrPayload);

  await page.evaluate((value) => {
    const input = document.querySelector('input[placeholder*="B27-B01-0001"]') as HTMLInputElement;
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, validQrPayload);

  await new Promise((r) => setTimeout(r, 300));

  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const procBtn = btns.find((b) => b.textContent?.includes("Process Manual Stub Vote"));
    procBtn?.click();
  });

  await new Promise((r) => setTimeout(r, 3000));
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("BODY AFTER CLICK:\n", bodyText.slice(0, 1000));

  await browser.close();
  await prisma.$disconnect();
}

run().catch(console.error);
