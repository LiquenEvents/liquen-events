/**
 * The Líquen wordmark, carried INSIDE every email as an inline attachment.
 *
 * It used to be an <img> pointing at https://liquen-events.com/email/... and
 * that broke twice over:
 *
 *   1. The asset ships with a deploy. Until production is promoted, the URL
 *      404s and every message that has already gone out shows a broken-image
 *      icon in the recipient's inbox — retroactively, since the fetch happens
 *      when they OPEN it, not when we send it.
 *   2. Gmail, Outlook and Apple Mail block remote images by default for a
 *      sender the recipient has never written to. That's precisely the case
 *      for a first-contact confirmation.
 *
 * Embedding as a cid: attachment removes both: the bytes travel with the
 * message, so the mark renders on first open, offline, and regardless of what
 * is deployed. Cost is ~7KB of base64 per email.
 *
 * Source of truth is public/email/logo-liquen-email.png (260x130, quantised to
 * 128 colours). It used to sit on an opaque WHITE plate, which in a dark-mode
 * inbox showed as a white box (audit finding n.º 28); it is now transparent —
 * see scripts/gen-imagens-email-escuro.mjs, which keeps it identical on white.
 * Regenerate this constant from that file if the mark ever changes.
 */
export const EMAIL_LOGO_CID = "liquen-logo";

const LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAQQAAACCCAMAAACXSEZJAAACSVBMVEVMaXHiz3/TtTLStC1nhW7dvTDVuDhlg2xwjHdmhG3exltx" +
  "jXjRsy16k4DZwEzdvS50j3vdvS7auy1kgmxhfmjWu0Fui3XWu0FkgmxtinTZui1lg2xphW/TtTJvjHbgy21nhW5kgWtoiHBmhW1o" +
  "iHDZui1tinRoiHBkg2xhf2hui3V6k4BkgWtohm9if2nXu0Fkg2xnhW50j3tlgmxmhW1vjHZxjXhoiHBjgWpkg2xlhG1lhG3cvC7W" +
  "u0HUtSx6k4BtinRkg2xnhW1tinRoiHDdvS5oiHB6k4BoiHBohm9xjXhjgWpxjXhmhW1kg2xkgWvQsi3YuSxlhG16k4BigGligGlx" +
  "jXhoiHBmhG1jgWp6k4DPsSvPsi3dvS5tinTiz39tinRlhG1mhW1igGl6k4BlhG1kg2zcvC5xjXjcvC5jgWptinR6k4BphW/dvS5i" +
  "f2l6k4BphW9lhW1xjXhhf2hjgWrPsSvexlvexlviz3/iz3/exltjgWpigGptinRphW/Psi3Wu0HTtTLUtS/iz39xjXhlgmx6k4Bj" +
  "gWriz396k4B6k4B6k4BxjXhxjXjdvS7iz3/exlvexlvWu0F6k4BphW9tinRhf2nUtSzexlthgGlphW9if2hgfWdhfWfZui16k4DW" +
  "u0HPsi3iz3/Zui1ffGZsiHPdvS7Rsy3Psi1oiHDiz39mhW3Zui1tinRjgWrUtSxxjXhlgmzWu0HTtTJifmjQsS3exltkg2xhf2lp" +
  "hW96k4DcvC5gfWdlhG3PsStigGlffGZjgGsku8XYAAAAp3RSTlMACRcCBQgGAgIECAQyAgSABbQEAywBDhMco3IJGwEJAnMtdmJY" +
  "PNrWcTgcBjkcGgPDLh5JnTDVoUlUVWEHGTWCeM9Wt2UBTQ/MO3uqvLCaXxUHmwo4l6i0SsogMAUezwVOctFIxq6sfFyvwGaxnUPJ" +
  "QtHGUV4NAh8J1U+Db79ZYzA4NGQLaczsUxpVbzQ/4BcjuQ+VYrA9p45GbsdTxUcb4GoLl6GTBFoSSEMAAAAJcEhZcwAAA+gAAAPo" +
  "AbV7UmsAABRLSURBVHja7V2JXxPX9j/iwExIo6kBBFEWN3YFFJCiAoILrnVf+rTVqtWqtW5drdr2dV9e29fl7b89hGEyk5kwMEtm" +
  "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";

/** Attachment descriptor for sendMail(). Fresh Buffer per call — nodemailer
 *  consumes the stream, so a shared instance would be empty on the 2nd send. */
export function emailLogoAttachment() {
  return {
    filename: "liquen-events.png",
    content: Buffer.from(LOGO_BASE64, "base64"),
    contentType: "image/png",
    cid: EMAIL_LOGO_CID,
  };
}
