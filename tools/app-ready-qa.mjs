/** Normal UI scenarios start when a user can interact with the painted app.
 * Startup and direct-camera probes deliberately do not use this helper. */
export async function waitForAppReady(page){
  await page.waitForFunction(()=>!window.PlatedioStartup||['revealing','ready'].includes(window.PlatedioStartup.state),null,{timeout:10000});
}
