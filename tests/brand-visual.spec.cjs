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
 expect(palette).toEqual(['#0362AF','#50B4F2','#87329A','#444444','#F3F5F8']);
});

test('company vector mark loads as a valid SVG favicon and header uses compact original mark',async({page,request})=>{
 await page.goto('/');
 const icon=page.locator('link[rel="icon"][type="image/svg+xml"]').last();
 await expect(icon).toHaveAttribute('href',/wsc-mark\.svg/);
 const response=await request.get('/assets/wsc-logo.svg');
 expect(response.status()).toBe(200);
 expect(response.headers()['content-type']).toContain('svg');
 const source=await response.text();
 expect(source).toContain('<svg ');
 const header=page.locator('.brand-logo-header');
 await expect(header).toHaveAttribute('src',/wsc-mark\.svg/);
 expect(await header.evaluate(el=>el.naturalWidth)).toBeGreaterThan(200);
});

for(const width of [375,768,1440]){
 test('chemical-dashboard identity remains legible and fits viewport '+width+'px',async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/');
  const l=page.locator('#loginScreen .login-layout');
  await expect(l).toBeVisible();
  const values=await page.evaluate(()=>{
   const get=s=>getComputedStyle(document.querySelector(s));
   const rect=document.querySelector('#loginScreen .login-layout').getBoundingClientRect();
   const logo=document.querySelector('.brand-logo-login');
   const im=get('.brand-logo-login');
   return {width:rect.width,left:rect.left,right:rect.right,
    bg:get('.login-screen').backgroundColor,
    line:get('.login-layout').borderRadius,
    fit:im.objectFit,clip:im.clipPath,
    hasLogo:logo.complete&&logo.naturalWidth>0};
  });
  expect(values.left).toBeGreaterThanOrEqual(-1);
  expect(values.right).toBeLessThanOrEqual(width+1);
  expect(values.width).toBeLessThanOrEqual(472);
  expect(values.fit).toBe('contain');
  expect(values.clip).toBe('none');
  expect(values.hasLogo).toBe(true);
  expect(values.bg).toBe('rgb(243, 245, 248)');
 });
}
