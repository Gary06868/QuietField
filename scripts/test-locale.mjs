export async function chineseUI(page){
 await page.getByRole('button',{name:'中文',exact:true}).click();
 await page.waitForFunction(()=>document.documentElement.lang==='zh-CN'&&JSON.parse(localStorage.getItem('quiet-field-settings')||'{}').locale==='zh-CN');
}
