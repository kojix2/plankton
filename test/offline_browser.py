"""Optional offline renderer/UI harness; not a compiler or deployment test.

Requires the separately installed Python playwright package and Chrome/Chromium.
Run `npm run build:cdn`, then `python test/offline_browser.py --xvfb` on Linux.
`--xvfb` needs Xvfb; omit it when a suitable display/headless driver already exists.

Local project assets are injected into a blank page. The tiny test-only module
adapter/fetch fixture never evaluates Crystal source. Browser URL-blocking policies
are not changed. HTTP, CSP, Worker fetching and real compilation are NOT tested.
The normal release check remains `npm run test:browser` with the local compiler.
This script regenerates original sample thumbnails and writes screenshots/results
under test-results/. No test adapter is included in the built app.
"""
import asyncio
import base64
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
async def load(page):
 assets={str(p.relative_to(ROOT/'dist')):p.read_text() for p in (ROOT/'dist').rglob('*') if p.is_file() and p.suffix in ['.html','.css','.json','.js','.cr']}
 images={str(p.relative_to(ROOT/'dist')):'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode() for p in (ROOT/'dist').rglob('*.png')}
 html=assets['index.html']
 import re
 html=re.sub(r'<meta http-equiv="Content-Security-Policy"[^>]+>','',html)
 html=re.sub(r'<link[^>]+>','',html)
 html=re.sub(r'<script[^>]*>.*?</script>','',html,flags=re.S)
 await page.set_content(html)
 await page.add_style_tag(content=assets['css/app.css'])
 await page.evaluate(r'''({assets,images})=>{
  const cache={},store=new Map();
  const loc={href:'https://fixture.invalid/hydra-crystal/?test=1',hash:'',reload:()=>{}};
  const history={replaceState:(_a,_b,url)=>{loc.href=String(url);}};
  const storage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value)};
  const fetch=async url=>{
    const key=new URL(String(url),loc.href).pathname.replace(/^\/hydra-crystal\//,'');
    if(!Object.hasOwn(assets,key))throw new Error('Test asset unavailable: '+key);
    return new Response(assets[key],{status:200});
  };
  const get=(name)=>{
    if(cache[name])return cache[name];
    const source=assets['js/'+name];if(!source)throw new Error('No module '+name);
    const exported=[];
    let code=source.replace(/import\s+\{([^}]+)\}\s+from\s+'([^']+)';/g,(_m,names,id)=>`const {${names}}=require(${JSON.stringify(id)});`)
      .replace(/export\s+(async\s+)?(class|function|const|let)\s+(\w+)/g,(_m,async,kind,name)=>{exported.push(name);return `${async??''}${kind} ${name}`;})
      .replaceAll('import.meta.url',JSON.stringify('https://fixture.invalid/hydra-crystal/js/'+name));
    code+='\nObject.assign(exports,{'+exported.join(',')+'});';
    const exp={};cache[name]=exp;
    new Function('require','exports','fetch','location','history','localStorage',code)(id=>get(id.replace('./','')),exp,fetch,loc,history,storage);
    return exp;
  };
  window.fixture={assets,images,get,loc,store};
  // Only test fixtures are injected; no browser policy/network configuration is changed.
  get('app.js');
}''',{'assets':assets,'images':images})
 await page.wait_for_function('document.body.dataset.ready || document.body.dataset.failed')
 if await page.locator('body').get_attribute('data-failed'):raise Exception(await page.locator('#console').inner_text())
 await page.evaluate('''()=>{for(const img of document.images){const key=new URL(img.src).pathname.replace('/hydra-crystal/','');if(fixture.images[key])img.src=fixture.images[key];}}''')

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROME_BIN') or shutil.which('chromium') or shutil.which('google-chrome'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=await browser.new_page(viewport={'width':1440,'height':1000})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await load(page)
  suite=(ROOT/'test/browser-suite.mjs').read_text().replace('export async function','async function')
  expression=suite+'''\nconst presets={},manifest=JSON.parse(fixture.assets['examples/manifest.json']);
for(const example of manifest)presets[example.id]=JSON.parse(fixture.assets[example.preview]);
return await runBrowserSuite({app:__hydraTest,modules:{renderer:fixture.get('renderer.js'),operations:fixture.get('operations.js'),share:fixture.get('share.js')},presets,manifest});'''
  results=await page.evaluate('async()=>{'+expression+'}')
  print('BROWSER CHECKS',len(results));print('\n'.join(results));print('UNHANDLED',errors)
  (ROOT/'test-results').mkdir(exist_ok=True)
  (ROOT/'test-results/browser.json').write_text(json.dumps({'mode':'in-memory fixtures; real Chromium WebGL2/SwiftShader; no network-policy changes','checks':results,'unhandled':errors},indent=2))
  manifest=json.loads((ROOT/'examples/manifest.json').read_text())
  for example in manifest:
   data=await page.evaluate('''async (id)=>{
    await __hydraTest.loadExample(id);const r=__hydraTest.renderer;r.pause();r.resize(480,270);r.reset();
    for(let i=0;i<50;i++)r.render(.05);
    return r.canvas.toDataURL('image/png');
   }''',example['id'])
   (ROOT/'web/presets'/f"{example['id']}.png").write_bytes(base64.b64decode(data.split(',')[1]))
  await page.evaluate("async()=>{await __hydraTest.loadExample('chromatic-tide');__hydraTest.renderer.pause();__hydraTest.renderer.resize(1280,720);__hydraTest.renderer.time=2;__hydraTest.renderer.render(0);}")
  await page.locator('#pause-button').click();await page.locator('#pause-button').click()
  await page.screenshot(path=str(ROOT/'test-results/desktop.png'),full_page=True)
  await page.locator('#language').select_option('ja');await page.wait_for_timeout(100)
  await page.screenshot(path=str(ROOT/'test-results/ja.png'),full_page=True)
  await page.set_viewport_size({'width':390,'height':844});await page.wait_for_timeout(100)
  print('MOBILE WIDTH',await page.evaluate('({body:document.body.scrollWidth,viewport:innerWidth})'))
  await page.screenshot(path=str(ROOT/'test-results/mobile.png'),full_page=True)
  await browser.close()
if __name__ == "__main__":
    display = None
    if "--xvfb" in sys.argv:
        display = subprocess.Popen(
            ["Xvfb", ":88", "-screen", "0", "1600x1200x24", "-nolisten", "tcp"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        os.environ["DISPLAY"] = ":88"
        time.sleep(0.4)
    try:
        asyncio.run(main())
    finally:
        if display:
            display.terminate()
            display.wait()
