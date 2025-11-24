
Netlify-ready static RE Matcher
------------------------------

This folder is ready to deploy to Netlify as a static site. It contains:

- public/index.html       -> main UI
- src/app.js              -> client-side JS (matcher + CSV loading)
- data/*.csv              -> CSVs (copied from your project if present)
- netlify.toml            -> Netlify config (publish = public)

How to deploy:
1. ZIP this folder or push to a Git repo.
2. In Netlify, create a new site from Git or drag-and-drop the ZIP / public folder.
3. Once deployed, open the site. Click 'Load default listings' and 'Load default buyers' to load CSVs from /data.
4. Run the matcher and download matches.csv.

Local test:
You can preview locally by serving the folder with a simple static server, for example Python 3's http.server:
  cd /mnt/data/netlify_site/public
  python -m http.server 8000
Then open http://localhost:8000 and the frontend will fetch CSVs from /data (so you may need to serve the parent folder).

Data files included (copied from your uploaded project if present):
