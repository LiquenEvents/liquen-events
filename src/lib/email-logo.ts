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
 * Source of truth is public/email/logo-liquen-email.png (260x130, on an opaque WHITE plate, quantised to
 * 64 colours — visually identical at a third of the bytes). Regenerate this
 * constant from that file if the mark ever changes.
 */
export const EMAIL_LOGO_CID = "liquen-logo";

const LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAQQAAACCCAMAAACXSEZJAAAAwFBMVEX///////7///3+//7//v7+/v7//v3+/v3+/vz+/vv+" +
  "/fr9/v39/f39/fv8/f38/Pr7+e/3+fj19fD28djv8u/u7dzu47Pk6eXd497T29XM1s/F0Mi8yL/n2JTiz3/exlvGwYfWu0Hd" +
  "vS7cvC7Zui3TtTLUtSzRsy3Bt2jPsi3QsS3PsSujtKeYq52LoJCEm4p6k4BxjXhtinRoiHBphW9mhW1lhG1kg2xlgmxjgWpj" +
  "gGtigGlhf2lifmhgfWdffGboA099AAARdUlEQVR42u1diXbayBJtrDQmRiNZWMdabR8MhoPRvjda+P+/elUtsdlkMn6TSQym" +
  "TuJAtyDpq1puVVcrhFzkIhe5yEUucpGLXOQin14E/pPib8ENTSJ+obUPie2pAuWvZV2BnyLRWeYT+oVAkIgbukQELALZjgKV" +
  "UJE42eprgSASOyl1ItIgMswsD6QhJX6ZOl/KHED569wjRIliaxhVqU3oKGmYAXZy7isXdq+pFDCmETVJLWJndaJSvSpD+eyt" +
  "gR46BSfPHQAhh7vvl8zD9zYMn7sYIyLsENHKVUBHRaURiAs185OyUM/dL4IXiL29RVLiFaUur1YjDBVpXawz9+w9AsSDuNZ2" +
  "KEjEYLlL6lAiQ0ErmrpeaVQ8exCcnFlboweGYPpZYawC7iwCVoMiHMFAkM4NhHzLAygVC9uK1wUow1AQlKiqS/2IItCzM4ec" +
  "dU5BGErgIQw5qWrkRxKx02pPESjdZRYj8xxUYYgBAe6xRKy8iZTu3lLqrFTipAxokkxHUVVlKl87HYp7zpPKwCjPxF2OCN5u" +
  "vVxX6BkpGUHKFIAz0Koms4iMwQHAkKjY3nVR3DpPK82skyYPAtxjPXBG1Ak9HZamsnVmg06ImDwppUMNP6hyixAzr3NflPjS" +
  "VdPxwkTtLEIMWGmcfD6hJiFwwagqHYVIUQPpgogMIY4sYIqhb2fMEtSIVakGOq8Yjg8GEmdO6xGHxCjWyR7DOsGKgeE7OtGj" +
  "1FC8tMkDXUubJlF40pwmfkOsRFVXkDp4GSZQRHNClpUsTxzddjmhALRY4Z1yhBCpnkeFI5sRLMOO8mydNE2dm1SSQP+rurIK" +
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
