const {test,expect}=require('@playwright/test');

test('company logo loads cleanly on login and respects its original proportions',async({page})=>{
 await page.goto('/');
 const logo=page.locator('#loginScreen img.brand-logo-login');
 await expect(logo).toBeVisible();
 await expect.poll(()=>logo.evaluate(el=>el.complete&&el.naturalWidth>0&&el.naturalHeight>0)).toBe(true);
 const result=await logo.evaluate(el=>{
  const cs=getComputedStyle(el);
  return {naturalWidth:el.naturalWidth,naturalHeight:el.naturalHeight,
   objectFit:cs.objectFit,clipPath:cs.clipPath,transform:cs.transform,
   src:el.getAttribute('src')};
 });
 expect(result.naturalWidth).toBeGreaterThan(240);
 expect(result.naturalHeight).toBeGreaterThan(120);
 expect(result.objectFit).toBe('contain');
 expect(result.clipPath).toBe('none');
 expect(result.transform).toBe('none');
 expect(result.src).toContain('wsc-logo.svg');
 const palette=await page.evaluate(()=>{
  const root=getComputedStyle(document.documentElement);
  return ['--primary','--cyan','--purple','--text','--bg'].map(k=>root.getPropertyValue(k).trim().toUpperCase());
 });
 expect(palette).toEqual(['#0362AF','#50B4F2','#87329A','#444444','#FFFFFF']);
});

test('company vector mark loads as a valid SVG favicon and header uses same logo',async({page,request})=>{
 await page.goto('/');
 const icon=page.locator('link[rel="icon"][type="image/svg+xml"]').last();
 await expect(icon).toHaveAttribute('href',/wsc-mark\.svg/);
 const response=await request.get('/assets/wsc-logo.svg');
 expect(response.status()).toBe(200);
 expect(response.headers()['content-type']).toContain('svg');
 const source=await response.text();
 expect(source).toContain('<svg ');
 const header=page.locator('.brand-logo-header');
 await expect(header).toHaveAttribute('src',/wsc-logo\.svg/);
 expect(await header.evaluate(el=>el.naturalWidth)).toBeGreaterThan(200);
});
