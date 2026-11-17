const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests',fullyParallel:false,timeout:60000,
 reporter:process.env.CI?'github':'list',
 use:{baseURL:'http://127.0.0.1:4173',browserName:'chromium',acceptDownloads:true},
 webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173/',reuseExistingServer:!process.env.CI,timeout:25000},
});
