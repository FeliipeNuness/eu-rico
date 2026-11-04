import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { cloudDatabase, syntheticSession, USER_A } from './cloud-database'
import { asUser } from '../database.mjs'

async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name:'Abrir menu',exact:true })
  if(await menu.isVisible()) await menu.click()
  await page.locator('.sidebar nav').getByRole('button', { name:new RegExp(`^${name}(?: [0-9]+)?$`) }).click()
}

test('chart module loads only near the viewport or after explicit request',async({page})=>{
  const db=await cloudDatabase()
  const requests:string[]=[]
  page.on('request',request=>{if(request.url().includes('/src/components/FinancialCharts.tsx'))requests.push(request.url())})
  try{
    await page.setViewportSize({width:1440,height:700})
    await db.attach(page);await syntheticSession(page);await page.goto('/')
    await expect(page.locator('.cloud-status')).toContainText('Revisão')
    await expect(page.getByRole('button',{name:'Carregar gráficos',exact:true})).toHaveCount(1)
    expect(requests).toHaveLength(0)
    await page.getByRole('heading',{name:'Evolução financeira',exact:true}).scrollIntoViewIfNeeded()
    await expect(page.locator('.financial-charts')).toBeVisible()
    expect(requests).toHaveLength(1)
  }finally{await db.close()}
})

test('local greeting updates across period boundaries without reloading', async ({page})=>{
  const db=await cloudDatabase()
  try {
    await page.clock.install({time:new Date('2026-11-03T11:59:00-03:00')})
    await db.attach(page); await syntheticSession(page,USER_A,86400)
    await page.goto('/')
    await expect(page.locator('.welcome-row h1')).toContainText('Bom dia!')
    await page.clock.fastForward(90000)
    await expect(page.locator('.welcome-row h1')).toContainText('Boa tarde!')
    await page.clock.fastForward(6*60*60*1000)
    await expect(page.locator('.welcome-row h1')).toContainText('Boa noite!')
    await navigate(page,'Tarefas')
    await page.reload()
    await expect(page.getByRole('heading',{name:'Tarefas',exact:true})).toBeVisible()
    await navigate(page,'Metas'); await page.goBack()
    await expect(page.getByRole('heading',{name:'Tarefas',exact:true})).toBeVisible()
  }finally{await db.close()}
})

test('payment lifecycle persists in isolated PostgreSQL and breadcrumb returns home', async ({page})=>{
  const db = await cloudDatabase()
  try {
    await db.attach(page); await syntheticSession(page)
    page.on('dialog',d=>d.accept())
    await page.goto('/'); await navigate(page,'Finanças')
    await page.getByRole('button',{name:'Adicionar renda',exact:true}).first().click()
    await page.getByLabel('Nome da fonte').fill('Salário')
    await page.getByLabel('Valor',{exact:true}).fill('2000')
    await page.getByRole('button',{name:'Salvar',exact:true}).click()
    await page.getByRole('button',{name:'Novo gasto',exact:true}).click()
    await page.getByLabel('Descrição',{exact:true}).fill('Internet')
    await page.getByLabel('Valor',{exact:true}).fill('100')
    await page.getByRole('button',{name:'Salvar',exact:true}).dblclick()
    await expect(page.locator('.expense-row')).toHaveCount(1)
    await expect(page.locator('.summary-block').nth(2)).toContainText('2.000,00')
    await page.getByRole('button',{name:'Marcar como paga',exact:true}).click()
    await expect(page.locator('.summary-block').nth(2)).toContainText('1.900,00')
    await page.reload(); await navigate(page,'Finanças')
    await expect(page.locator('.summary-block').nth(2)).toContainText('1.900,00')
    await page.getByRole('button',{name:'Desfazer pagamento',exact:true}).click()
    await expect(page.locator('.summary-block').nth(2)).toContainText('2.000,00')
    await page.getByRole('button',{name:'Dashboard',exact:true}).last().click()
    await expect(page.locator('.welcome-row h1')).toBeVisible()
  } finally { await db.close() }
})

test('legacy review, monthly recurrence deduplication, filters and payment in another month',async({page})=>{
  const db=await cloudDatabase()
  const today=new Date().toLocaleDateString('sv-SE')
  const previous=new Date();previous.setDate(1);previous.setMonth(previous.getMonth()-1)
  const paymentDate=previous.toLocaleDateString('sv-SE')
  const fixture={name:'Teste',theme:'light',savingTarget:0,month:today.slice(0,7),income:[],tasks:[],goals:[],expenses:[{id:'legacy',description:'Internet antiga',category:'Internet',date:today,amount:100,type:'Fixo',recurrence:'Mensal'}]}
  try{
    await asUser(db.db,USER_A,'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)',[JSON.stringify(fixture),crypto.randomUUID()])
    await db.attach(page);await syntheticSession(page);page.on('dialog',dialog=>dialog.accept())
    await page.goto('/');await navigate(page,'Finanças')
    await expect(page.locator('.legacy-warning')).toBeVisible()
    await page.getByRole('button',{name:'Confirmar pendente',exact:true}).click()
    await expect(page.locator('.legacy-warning')).toHaveCount(0)
    await page.getByRole('button',{name:'Gerar próximo mês',exact:true}).click()
    await expect(page.locator('.cloud-status')).toContainText('Revisão 3')
    await page.getByRole('button',{name:'Gerar próximo mês',exact:true}).click()
    await expect(page.getByRole('status')).toContainText('já existe')
    expect((await db.db.query('select * from public.eu_rico_expenses')).rows).toHaveLength(2)
    await page.getByLabel('Buscar despesa').fill('inexistente')
    await expect(page.locator('.expense-row')).toHaveCount(0)
    await page.getByLabel('Buscar despesa').fill('Internet')
    await page.getByLabel('Data do pagamento de Internet antiga').fill(paymentDate)
    await page.getByRole('button',{name:'Marcar como paga',exact:true}).click()
    await expect(page.locator('.summary-block').nth(1)).toContainText('0,00')
    await page.getByRole('combobox',{name:/^Pagamento/}).selectOption('Paga')
    await expect(page.locator('.expense-row')).toContainText('Paga')
    await page.getByRole('button',{name:'Mês anterior',exact:true}).click()
    await expect(page.locator('.summary-block').nth(1)).toContainText('100,00')
    await page.reload()
    await page.getByRole('button',{name:'Mês anterior',exact:true}).click()
    await expect(page.locator('.summary-block').nth(1)).toContainText('100,00')
  }finally{await db.close()}
})

test('all views fit eight widths in both themes, forms and accessible payment states',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Explicit viewport matrix runs once')
  test.setTimeout(180000)
  const db=await cloudDatabase()
  const errors:string[]=[]
  page.on('pageerror',error=>errors.push(error.message))
  const date=new Date().toLocaleDateString('sv-SE')
  const data={name:'Ana Silva',theme:'light',savingTarget:100,month:date.slice(0,7),income:[{id:'salary',name:'Recebimento do trabalho e projetos pessoais',amount:4500,recurrence:'Mensal',date}],tasks:[{id:'task',title:'Organizar os documentos e revisar o planejamento financeiro desta semana',description:'Revisar despesas, prioridades e compromissos.',date,time:'12:00',priority:'Alta',category:'Trabalho',done:false}],goals:[{id:'goal',name:'Reserva para projetos pessoais e planejamento de longo prazo',description:'Acompanhar aportes sem comprometer contas pendentes.',target:10000,saved:1000,deadline:'',category:'Financeira',priority:'Alta'}],expenses:[{id:'legacy',description:'Conta antiga a revisar',amount:100,category:'Internet',date,type:'Fixo'},{id:'new',description:'Conta pendente',amount:90,category:'Outros',date,type:'Variável',paymentStatus:'pending',recurrence:'Mensal'}]}
  try {
    await asUser(db.db,USER_A,'select public.eu_rico_save($1::jsonb,0,$2::uuid,false)',[JSON.stringify(data),crypto.randomUUID()])
    await db.attach(page); await syntheticSession(page); await page.goto('/')
    for(const theme of ['light','dark']) {
      await navigate(page,'Configurações')
      await page.getByRole('button',{name:theme==='light'?'Claro':'Escuro',exact:true}).click()
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme)
      for(const width of [320,360,375,390,430,768,1024,1440]) {
        await page.setViewportSize({width,height:900})
        for(const view of ['Dashboard','Tarefas','Finanças','Metas','Configurações']) {
          await navigate(page,view)
          expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${theme}/${view}/${width}`).toBe(true)
          if(view==='Tarefas') {
            const check=await page.locator('.task-check').first().boundingBox()
            const copy=await page.locator('.task-copy').first().boundingBox()
            expect(check!.x+check!.width,`${theme}/${view}/${width}: checkbox overlaps text`).toBeLessThanOrEqual(copy!.x)
          }
          if([320,1440].includes(width)) {
            const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
            expect(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([])
            await page.screenshot({path:`diagnostics/update/${theme}-${view}-${width}.png`,fullPage:true})
          }
        }
        await navigate(page,'Finanças')
        await page.getByRole('button',{name:'Novo gasto',exact:true}).click()
        const dialog=page.getByRole('dialog')
        const bounds=await dialog.boundingBox()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width+1)
        await dialog.getByRole('button',{name:'Salvar',exact:true}).scrollIntoViewIfNeeded()
        await expect(dialog.getByRole('button',{name:'Salvar',exact:true})).toBeInViewport()
        await page.keyboard.press('Escape')
      }
    }
    expect(errors).toEqual([])
  }finally{await db.close()}
})
