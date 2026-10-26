import { defineConfig } from 'vite';
import {fileURLToPath} from 'node:url';
export default defineConfig({base:'./',resolve:{alias:{'#catalog':fileURLToPath(new URL('./src/catalog.public.json',import.meta.url))}},define:{__REVIEW_BUILD__:'false',__PUBLIC_LIBRARY__:'true',__APP_VERSION__:JSON.stringify('1.8.0')},build:{target:'es2022'}});
