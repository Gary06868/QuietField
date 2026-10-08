export async function chineseUI(page){
 await page.getByRole('button',{name:/^(设置|Settings)$/,exact:true}).click();
 await page.getByRole('button',{name:'中文',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.lang==='zh-CN'&&JSON.parse(localStorage.getItem('quiet-field-settings')||'{}').locale==='zh-CN');
 await page.getByRole('button',{name:'关闭弹窗',exact:true}).click();
}

export async function openBackground(page){
 await page.getByRole('button',{name:/^(设置|Settings)$/,exact:true}).click();
 await page.getByRole('tab',{name:/^(背景|Background)$/,exact:true}).click();
}

export async function englishUI(page){
 await page.getByRole('button',{name:/^(设置|Settings)$/,exact:true}).click();
 await page.getByRole('button',{name:'English',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.lang==='en');
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();
}
