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
 * 64 colours — visually identical at a third of the bytes). Regenerate this
 * constant from that file if the mark ever changes.
 */
export const EMAIL_LOGO_CID = "liquen-logo";

const LOGO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAQQAAACCCAMAAACXSEZJAAAAwFBMVEX//vn//Pf/+/b++vX9+fT6+fz6+fr7+Pf79/L69/H5" +
  "+Pn59/f59vD49vT49fD49O/39O/39O739O329O738+z28+728+328+z38+v28+v28+r18+318uz28un18OP08uvx7uPv6tbn" +
  "59/m4sro2qTl1ZXV2tDeynLWvEvCyr+xva/QszHQsi3PsSvOrybNriLNrSCrsIXMrB7MqxuPopF9k4BxinZog25if2lffGZc" +
  "eWNZd2BXdl9VdV5TcltNblYlsBifAAAUdElEQVR42u2daXuizNKA2cwFSpigPuT4QAaCCdpo1Eu72Zf//6/eqkaMGjOTM+c1" +
  "icn0l2HTsW+qa+vqjmD+babwF8FfCH8hfGIIg78QTFO3vheEwXN/re2hYXjKt4JwoylGA8AyVdXGw75GE6JY3weCpVKKEIaa" +
  "oum+L0PXHYmURfTPtxoOUR2KjqUELPDiLJQc0xFpmUau8Y0kQaFF4muuSGvqJllJJNc0WFZQ+RsNB0cIizIUXI1VVEAJ8AzN" +
  "T1K45HwfCLYcZFnk6SarqeCnSRWKapCnia9+bUmwrIP+ofAT0QYIshRWSRYIYZlT2f7SitHSVPVwPGCfLQb60XIjEAsSZXkg" +
  "OV8ZgqX6Edl7z3CepKmvsJqIrkjKJCvSnOlf222GN18f2D9XoKgaWRVItqWyIkmSkojOl4ZgyzTPgmdRsAwXVaPBCl+xHBSF" +
  "NH93J+Hdh4PC8jLce9MqI7TIwwi8BctW0DJUp+3jwLW+kiQUdAcBTGQdkCrJ+et3QUsmWeTqJ0JpyxDOGU+8FwRuGtEpzpnW" +
  "9NK20Tj4gyhLcqZalu7BUbUnJ3sRpu6GwRkpvAMEAwGoumNxk5jGIPp4WZJBFUamCP5BCa4BCEKVFExrem07tqHtlIMlg2N9" +
  "Ru/h/BAMR1FvNd8TdIfrvrzRjEYQyH5BJQVcxZKKLniPacq1pu1amiTItmdvKYC2yHJ2sZJg2a4SxNQXgjQOPRFOskb1gToo" +
  "qyCoiUAYywCCPWA53nIdUxEUPwgpy6jSvHwYRcWeKrk0CIosql4EvkFQZWVMJBmcowLfqSMR6HqYe3rMSAlxo0RxMBiOJlgA" +
  "IM7Lqk6I0N+5VGeNqs4JwZJDFoIUJHUIyiBLS+qizGOAhB3LGYvAe/K9GIJIUiRZ4iuSH0ZZladgMEI/DAdbF6tKwK+8zOHg" +
  "iGFdxaEQlJErkajMiijK0q1PaLA8zliQhRJqPTfO4LrghgkQSIqMEXAm6xJNApiNOEX7cakmUoVO1SyE/smKG0ZFlUGssB0P" +
  "tAShqKhkQPzIaIkKgURVCg+kNFBkGVyn2NMtk5sNDm5gO9YFQjBRvGF058x0DMElLEMMWaDYXMaTkhmyz9AsJAX1wKeG4AHe" +
  "uiC4rhgWBeoBS/PjNAMcjqPLota/QAiOKtgEAiMUdccQlSCMS7CIko0Z1SSLfcGPihzffkajCtRhVeChJzkwXHh2BYYFdyRc" +
  "WXQD4usXCMG0XFN0WZFGKNmOpQge5a4CWEsYGAQZVJQWCSiCKmU0DPG4jAIwqiVaRQf9h6Qiwo+ARmkN+C4LguU0Rs1V3Sgr" +
  "GztvuRoYffB8HPCSSyZ4rEpDP4YBkYMmEARRwBePSVdS4aixTB0kAkZIyLIiy6rwwiBYiig1/r+rgKFvE0b2D41BPK24Gisj" +
  "wmoWcAuYs0AUCNFcUwVRSeuEVUz7Z2segQqMkxJshnJZitFSCCWq4jS5E1JgfMiROICkpIKK+eWiYq7oxagWVcXw89TTHP0G" +
  "+k9BdsAgOALmGIqqzJOIhoEhXph1cKSwrpnfOLuYXC/o1udDmxcT5oPcYzQl81wKM8GVyFNwDBBSEkY5aBFXDPIkz1gYBr4r" +
  "C7J5JqfxjDpBDWiVEt7zAQ7tbDsgBroblTRNIHIGiXBVlqfoQclAAyFwSCX6yXwYlSxQRFFWDds9Wxh5Rp1giUKQF6GIkbQD" +
  "xgBTJ1brB0ck5s6jrKInjYGkgkYTnWMIrtBogn0EM1lSXbYdxz7rTMT5dALOsYYQMISSYfMxUJZtJGi4UQ3qH90mTWw0H0QU" +
  "Aql4rsECYOhLgIcAoZVknD/vei4IA91jcVJwz1hXXd7x3ZQC6IsqZhmGTJoGrlRe8jCaVJFjoEqFgLsIQDJADsR/3mE26lwQ" +
  "LMUvyzwDkU8q5om2AxaizCLb5CPbMFgZg8qLcNhXYUAZDBaR1DxMwuGQMVvxIbpUzPeYkTuniYygpRXo95gokmF6EWo7SYJu" +
  "uSKpWABuUADGMw8ESQeTGATgEDoYfBKcjLDBh3Dfp3TnjNZBNlzH9UOWF3lBicsdgySkBFwoeMGsJkEFsRIFRQC2MIThT2qe" +
  "OeEOkg+RdOwr7zMPc0YINki9oQo6OP1ZXUUU/knTEtSjbAQ2iAJqhYrQmoEu1MBjSuNm0sHGBAOmZAPJNS8dQhtAYfgXsrSu" +
  "MZkAdqCkNLYNJwKNEcVRVGEe2RHRdSoIDofGduQYeCJK6/IhYDccXRY0n9CE51SSPC9jz+SJ54hiYA2GE80iBFGYbEbjkDKc" +
  "gbj9YTmm/A5VXO8y+YIpIVWUfUwm5IwW8MpFx45yUBFJ2owBLN1JeSKRqwSIOlXThQ+ZQaAMvwSE7bhQJJ8nE4K4imwbRaEK" +
  "ad6kHHFKoqlRgdEABiXybsSQ2oRlOZGdLwNBdV1Fl0IIJxWfgR1wrSiraFjmHAJm0TKEADQqnnh2ZVZFeVFU55+rF86vEWzb" +
  "sixH86MIrKNES/ABAswzQsCUMZIXTSe5agQIPwYoCET0BJInZRnTQB1c/HCQREmBpolBUtXUFQRwkz0f5N1VHTiEodHMwTpS" +
  "gJG024wSARzMtMxZ6Ivy4NIVo2EEJAgCHxvYyTwKgzDLGXgIBcN3XRBWb+eWwGhWYCJ1nJWD4IlkBQ0MQXPeoYrrzHORCq1r" +
  "TCCnYAlixuK8LPEEWlqwAKMD2vjKTS1PKMkkz5mpisAgFGWTTzTYrnPRkqBRBuERuEUMJ6DKjAfN4BuyKE7rMsIMas2MNuTK" +
  "mWqyMrIEH+xl5guuC+rEsWRBuuzhoCmYP2a+GMTYcJ4lolkaqH5AKKaUwqwtWNAh2PZIlUYkjIskyZgvi6BNRDkIiX7RinGo" +
  "E5xFERzNA7VgUOhdGsEoEA1F4mUZNCqbggVHDIsc1EaS13WZl1VeJJQEwIpVdR0oF1yzxOdkQf+7ji4KguLTCiKogifPXNfS" +
  "GCiAVjOik5RmGQbeASFhCJ5zVYDk8DmZ85a0nRmCLRNGieJoIq+7SCsG/YvKhNdcOBglJKyircuIkUUR+YIsiSIQC3GGLg9x" +
  "RkazLno4KJoiOaoH0VMMNoEZgtTMxGGM6PLa9ozXsFoKw8m4PPJl13agWSrO4KYYg1PiXbIkQOcGlqt7UZ0QMcwKnJd1dSEE" +
  "sQ8kd6BjGoGHDFiXhMYzBn95F20YogbORVHX9Xmr/98ldjBcEvoy+AGxj/kyyxFIUsY+aAo+y4ZphOYILIW8n0jBGVzVJyH4" +
  "zpdfzGnAqHYVsqvudgWMJAMYERBQcy+Zx4786Dj4HKigIdSL1gntK8WyXEXdGTpX8qMqIYKlBAVoSQWEI8zTvKInyvwtVBBf" +
  "I5Q2D1d8uLLPqpy6ikyrNPYMNYjKmGXh+5e4mx+4/MdRXYiqo0DUI5yltKM6ChTfMszvBMF0dCVMq4z6XgzKn9TUk23tY37K" +
  "By4EsywhYGWVhEHGBBqKumNanxtCv3+GujFXNsB9rGmYeJZkWR/2Ot4IoW9cX59huNomeIU0osm7zbP8DxD6xs977+7mHJrB" +
  "kETT9z3D/OwQ+tfedDYf984yAeA4hqro5qeHMLqarFeT3tkmQT5QHbwZwrA3XjzNfl73zS/a3gZhulw9dP41vzGEUedhsZz2" +
  "huY3hgCWYbqZ319/awi3vfF0+nA1Mr8zBNMER+lYKfbP4kF+Fgij0eil3I/+vdu/OBzdAJabgwcPPzeE0/7uxkFrnurj4R7T" +
  "5+c/AQTj6uqq9+LndK+uus8/eNi7Gt3f3//b7Q77pz/Xv77qXhn99sZB6zV6Bh7Y+0p8/gMtsHCkAyeTyeMLHfgIF1u/dmh0" +
  "xxPwH2fTybhnDPc+99C7bbXIA5yiKm1uHLRH6Ozw+h6PdnJzPYbTcfvxj4Zwfb9YbY6sYf/mbrbZTHc/+G6yXC2enp4Wq9Xk" +
  "ruEFnVqtNpPubWtTJ5vFZtwd4o31er1aPrfNFCCMug+b5WrT+uGjqwd4/rEz+iwQZvPl5AWE6dNi2srKHdjL+Wq1XK3m8830" +
  "Jxd66Ot8ttyD8LiaLbYQ5vP50zODxRbCeDGbrSZbkwMQljPwxj4PhKfVCQiLFsKwN9nMFovJw/hhsljMNs2z0Nen+Wofwnq2" +
  "3EIAkZkeDweQhOX8aTFrECKE1Wx9MRDg169nT/Nxp9vtdsbzJ3h/3dFvIMzXk06v2zauGBsI8/XW+7gwCBhFoODejYajuw78" +
  "9BVXIL+GAF94d2gitxDgxu3lQeD3F9OdTZhCcHnfaPtfQugeda+B8PS0dcYvC8J/uuPlDKR7tMsyQF97wz+FMF83FuGyIMCv" +
  "Xc/WrS3jfV3huP4zCIt5q2kuEEIbTPG+rv8cAmhY/tB3hrCaTBeNq/AKBAuLQHnDSnfrudy9OTy8jRvVbAseB8259dy2d3BS" +
  "0/5UEGabh8nmibsKr0DQlF1T4UzerY5VZO3wNp7qSput1fmThrLX+B1HEwXh5LqyD4TwOF41Hz8NQfeDXfMNPHN+NC8UznXr" +
  "4LZuGV4QNHl7HY4c03CDvebp5sAUfRKGgXtitfXHQVg/Xk2btN1JCLhENM2aVjFdDKtmwzJcGYFlDBJtb6cV5dvXNXt5NYuH" +
  "dDkos7alWDn2QwuTsq7ziLyc/f9ICMLjev4EfsarEJKmxRnVZJI3e8vgMrGcSAChbG/nDQTcnqCBECOEFO/hUht4gIiuQqsi" +
  "xp18ipcU3gVC6zH2DyF07htX4VUIcVMU7fueqfrJtsqNv2kVJSHy29sGr33jKycaCKrp4vUwzwjWT7oWL6n3VS2I89g7roV7" +
  "BwgYOzQJFaN/OByup8vFtP/6cIg9WVOxaQPDYtV21SStmPXDkWjN1G3TmwLAkq+maiBYBlzGxfqBoKuqAY/DVSyNItnL3YrO" +
  "D2EvimxT1lsI3d4Df+7uVQi+7jRGzuS98PQB1nxiUQ+H0JrAwbYKki8a2UIAE+lKCEFx4eM/gCGVXHNgWdHLmqB3gIDpF96e" +
  "syhbSTB/4n939QsIO8Hl27YFCt+gCVdNcQjPTzcQ+I0WQqM+Gm060L2oWVdhgW6givX+ELZJlcX6CELn7mqyAlfhpvt7CLiz" +
  "L99WQiI5Lpp7CaGKYcDo288dQeCLKUB9NosuX+zZ9B7DYTaZNu1oOHTueED2AMPitxBwjdTzi9asUxAIrik8DcECTcK38hjo" +
  "AQn0j7AOneseb0eKEXuNrsL1GyQBnCCGcsw7j5bwJYTEZzW87ZMQcLjkVMDpb0VSzI8xkUPejk3kCJ+cP407b4CAC8Ui9Amx" +
  "p84pCKkX1pGHGzy+hGCaN6zIQ0VzIIKwPpOz1Bk1JvTxVQieYui6vlN9aaDqMCpIC0Hn7VkSfNyaQzoJwVL8OC+od7Is6GMh" +
  "YOIWXIXXdELCsIV8W0Yb3GXcwi3A/YnsxmTi3SiUnRaCQGuqviIJjoJ7e0WBYA8+GwT+javxeH06dqjruqoZD3kaKyfBe47Q" +
  "XeAb2PHbVHiGgLuyCKchAAWXFlkWii//qMwHQ+gb4CqsJ+PN6eEQYiONYsCVdVSFUcDNPEpCxG/zAvgGgoycXoNgOrocZllJ" +
  "lc8mCTxR+TR9WJyG4AiiKGxXhzbbf2vb1UJcJwi4T5li7XSCLsJF8TUIvHo0xq3Lbs8JYbibhnszhGFvvJw/TXES4pR1uHGd" +
  "dnsl7hTiNp7NAnOEgAtkml2tm5uqEmRFQE7rBJdvY+Lj9jbHG//+CYTOMQT+ueeKHny788V+Gvp1CGC7pov54jUIe36ChduV" +
  "BX7ebFR6ym0GhamDoJyGIHGRcfnufvL/FDvs//g9qe/f/IuP/HvTTtpOl4cTEr+A0LgKb4DAd9gIyXZH/NMQ4EM1C8tTEEij" +
  "PHgIfry27r+CwPsEb3z03Ndm/uS2O1nNl+PmBs7Cglyge/gGCH18+k0Q+F4r4XYX69MQHNzYl2XJy9jBjlozgu7HUULhFITr" +
  "g1mz/Wm4vjFdgqB37ob94V0HRvNyymsrGks3ueqP+v0RVwnNTPsvpuF2EnXbA4BvgYCacbeK8jQEy5H51q8vIfBQeguB29jf" +
  "QehcdXat1z+YkL162MwWs/vO9fV15x6ONo2WxBn7xWz1eNW9vu52HnFSAUfDLqnSff7Cbv8IAqZUXoXww0Xl1yTKHSkokqRo" +
  "du3aKcZGN+4gSG1e4SiAggiaabZt4dYU7W7yv4CwmD7utYfrg6l505iuoO+P4/v7R/h3NTVaXfiwnsM7f7i/H09AIWweORwO" +
  "4cUXHkJAV+E1xegIkiiileSakf9dkLaDCEFsmrD94xC4lhgXXJ+AgOmIjAiqKpCsekNmaf60XrVtuZl2R/tFGtCr2Qrcm8Vs" +
  "sX6Co11547D7uHmaLZfz+XI1m28mTQFTU6SxOPjCpkhjCXLzPKe5mr0o0micJcJbGDTya7As266x584SaW9rbgvBETABu4OQ" +
  "pw0Evv1hEvp+mBS/zzE+rZbLxa49bSYIYbZat5Iw6t1PNwuuyhab6X1v98P7vUfggnoevmJyfdNCWO5/32Kxbst1nutzwFVY" +
  "L1+U66Ciz2reqjraekS0qrY7+aEk5O1tKrgiPI0QIMQoimwHodquRsfrcVVlaVUlL9yEF4Vb06P22Ls1h5PpdNJaldG1+Tjl" +
  "EKaPw2cGZr9/NZ7MFtDl2WTcNfut4Bx/4QQg8PrQ6UN357lNDk95L+UwYm2jTadkEkXbvXb2b0MM5cIt1nTdoHCkNc8HcLjN" +
  "pTmyT6MkjagvO78p4bu5No5ae3G34mN40+XT0Y+d7s2BLR31rn6Oof3s9v7zbNyNE1+4vXz0vx7/NH2vtZc0TX/ltq63fw9C" +
  "3R3tXQRZUEXP9z1JdX5bzNk/dd4/vH7Xabznu6OHhyOj1+32jNvh774Q/9kvicX/4C1ljIO3/F3R1xZPWA7OV55aZ/onq+FG" +
  "nf0Q4qCH+/mjz9cGmJ03/x8hrL5QzfefQXjczDffHcLVw3w6e+h+awigAn/+/PmFS/3f1m5OWLRvB8H8Ums+/v6Z9b8Q/kL4" +
  "C+Gg/R9NqBeHuoAyMQAAAABJRU5ErkJggg==";

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
