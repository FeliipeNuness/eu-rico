import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { cloudDatabase, syntheticSession, USER_A, USER_B } from './cloud-database'
import { asUser } from '../database.mjs'
import { normalizeSubscription } from '../../supabase/functions/_shared/cakto.mjs'
import { providerFixture } from '../billing-fixtures.mjs'
import { readFile } from 'node:fs/promises'

test('before activation keeps the existing app; account tools stay accessible',async({page})=>{
  const f=await cloudDatabase()
  try{
    await f.attach(page);await syntheticSession(page);await page.goto('/')
    await expect(page.locator('.sidebar')).toBeAttached()
    await page.goto('/conta')
    await expect(page.getByRole('heading',{name:'Assinatura e conta'})).toBeVisible()
    await expect(page.getByRole('status')).toContainText('acesso atual está preservado')
    await expect(page.getByRole('button',{name:'Continuar para assinatura'})).toBeDisabled()
    await expect(page.getByRole('button',{name:'Exportar meus dados'})).toBeEnabled()
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([])
  }finally{await f.close()}
})

test('after activation unpaid accounts cannot mount dashboard; export and deletion remain usable',async({page})=>{
  const f=await cloudDatabase()
  try{
    await asUser(f.db,USER_A,'select public.eu_rico_notes_save($1,$2::jsonb,null)',[crypto.randomUUID(),JSON.stringify({title:'Nota exportada',content:'Texto privado de A',category:null,is_pinned:false})])
    await asUser(f.db,USER_B,'select public.eu_rico_notes_save($1,$2::jsonb,null)',[crypto.randomUUID(),JSON.stringify({title:'Outra conta',content:'Texto privado de B',category:null,is_pinned:false})])
    await f.db.query("select eu_rico_billing.set_activation(true,'Fixture local: ativação de teste')")
    await f.attach(page);await syntheticSession(page);await page.goto('/?status=paid&user_id='+USER_B)
    await expect(page.getByRole('heading',{name:'Assinatura e conta'})).toBeVisible()
    await expect(page.getByRole('status')).toContainText('necessária uma assinatura válida')
    await expect(page.locator('.sidebar')).toHaveCount(0)
    const download=page.waitForEvent('download')
    await page.getByRole('button',{name:'Exportar meus dados'}).click()
    const exported=await download
    expect(exported.suggestedFilename()).toBe('eu-rico-backup.json')
    const contents=JSON.parse(await readFile((await exported.path())!,'utf8'))
    expect(contents.format).toBe('eu-rico-account-export')
    expect(contents.ownerId).toBe(USER_A)
    expect(contents.notes.map((note:{content:string})=>note.content)).toEqual(['Texto privado de A'])
    expect(contents.financialBackup).toHaveProperty('data')
    page.on('dialog',d=>d.accept())
    await page.getByRole('button',{name:'Solicitar exclusão da conta'}).click()
    await expect(page.getByRole('button',{name:'Exclusão solicitada'})).toBeDisabled()
    expect((await asUser(f.db,USER_A,'select public.eu_rico_billing_status() value')).rows[0].value.deletionRequested).toBe(true)
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([])
  }finally{await f.close()}
})

test('confirmed subscription uses same account; expiry hides the open dashboard',async({page})=>{
  const f=await cloudDatabase()
  try{
    await f.db.exec("update eu_rico_billing.settings set checkout_enabled=true,product_id='product-local',offer_id='offer-local'")
    const intent=(await f.db.query('select public.eu_rico_billing_admin($1,$2::jsonb) value',['intent',JSON.stringify({userId:USER_A})])).rows[0].value
    const p=providerFixture(intent)
    const snapshot=normalizeSubscription(p.subscription,[p.order],p.cycles,p.config,intent.id,p.order.createdAt)
    await f.db.query('select public.eu_rico_billing_admin($1,$2::jsonb)',['apply',JSON.stringify(snapshot)])
    await f.db.query("select eu_rico_billing.set_activation(true,'Fixture local: assinatura confirmada')")
    await f.db.exec("update eu_rico_billing.cycles set ends_at=now()+interval '6 seconds'")
    await page.clock.install()
    await f.attach(page);await syntheticSession(page);await page.goto('/')
    await expect(page.locator('.sidebar')).toBeAttached()
    await page.clock.fastForward(8000)
    await expect(page.getByRole('heading',{name:'Assinatura e conta'})).toBeVisible()
    await expect(page.locator('.sidebar')).toHaveCount(0)
  }finally{await f.close()}
})

test('Google login preserves fixed subscription return path; expired session returns to login',async({page})=>{
  const f=await cloudDatabase()
  try{
    await f.attach(page)
    let target=''
    await page.route('https://launch-test.supabase.co/auth/v1/authorize**',route=>{target=route.request().url();return route.fulfill({status:200,contentType:'text/html',body:'OAuth local interceptado'})})
    for (const path of ['/', '/assinar', '/conta', '/?redirect_to=https://example.invalid']) {
      target=''
      await page.goto(path)
      await page.getByRole('button',{name:'Continuar com Google',exact:true}).click()
      await expect.poll(()=>target).toContain('redirect_to=')
      const params=new URL(target).searchParams
      expect(params.get('redirect_to')).toBe(`http://127.0.0.1:4174${['/assinar','/conta'].includes(path)?path:'/'}`)
      expect(params.get('code_challenge')).toBeTruthy()
      expect(params.get('code_challenge_method')?.toLowerCase()).toBe('s256')
    }
    await page.goto('/')
    await expect(page.getByRole('button',{name:'Continuar com Google',exact:true})).toBeVisible()
  }finally{await f.close()}
})
