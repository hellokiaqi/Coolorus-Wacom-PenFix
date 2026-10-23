# Notice

This repository is an **independent interoperability add-on** for a third-party Photoshop
extension. It exists to document and work around an input-handling defect, not to distribute
someone else's software.

## What is not included

- No Coolorus source code, in whole or in part.
- No Coolorus assets: icons, fonts, images, stylesheets, locale files or compiled bundles.
- No copy of the Coolorus extension package, modified or unmodified.
- No patch, diff or reverse-engineered reconstruction of Coolorus code.

`src/penfix.js` is written from scratch. It observes standard DOM pointer events and calls the
createjs stage instance that the running extension already exposes in the page. The only change
made to the user's own installation is a single `<script>` tag that loads this file.

## Trademarks and affiliation

"Coolorus" and "Adobe Photoshop" are trademarks of their respective owners. They are used here
only to describe compatibility. This project is not affiliated with, authorised by, sponsored by,
or endorsed by the authors of Coolorus or by Adobe.

## Your responsibility

To use this patch you must already own a valid licence for Coolorus. Installing the patch is a
local modification of software you are licensed to use; redistributing the Coolorus package
itself is a separate matter and is expressly out of scope for this repository.

If the vendor would prefer this work to be published in another form — for example as a pull
request against a supported build, or as documentation only — please open an issue and it will
be adjusted promptly.

## Scope of the licence

The MIT licence in [LICENSE](LICENSE) applies to the code and text authored in this repository.
It does not extend to any third-party software mentioned or targeted by it.
