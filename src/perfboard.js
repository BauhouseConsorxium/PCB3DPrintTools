import { mount } from 'svelte'
import './app.css'
import PerfboardApp from './PerfboardApp.svelte'

const app = mount(PerfboardApp, {
  target: document.getElementById('app'),
})

export default app
