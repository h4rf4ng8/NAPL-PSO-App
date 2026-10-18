import assert from 'node:assert/strict';
import {test} from 'node:test';
import {renderCardToBlob} from '../src/components/player-card-image';

test('export preserves source images and revokes the SVG URL after canvas failure or abort', async () => {
  const original = Object.getOwnPropertyDescriptors(globalThis);
  const created: Blob[] = [];
  const revoked: string[] = [];
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  class Svg {
    removed = false;
    attrs = new Map<string,string>();
    viewBox = {baseVal:{width:320,height:510}};
    cloneNode() { return new Svg(); }
    querySelectorAll() { return [{getAttribute:()=> 'https://broken.example/image.png',remove:()=>{this.removed=true;}}]; }
    setAttribute(key:string,value:string) { this.attrs.set(key,value); }
  }
  let clone: Svg;
  const source = new Svg();
  source.cloneNode = () => (clone = new Svg());
  const container = {querySelector:()=>source} as unknown as HTMLElement;
  let abort: AbortController | undefined;
  class FakeImage extends EventTarget {
    set src(value:string) { if (value) queueMicrotask(()=> abort ? abort.abort() : this.dispatchEvent(new Event('load'))); }
  }
  try {
    Object.assign(globalThis, {
      SVGElement: Svg, Image: FakeImage,
      fetch: async()=>{throw new Error('offline');},
      XMLSerializer: class { serializeToString(){return '<svg/>'; } },
      document: {createElement:()=>({getContext:()=>null})},
    });
    URL.createObjectURL = blob => {created.push(blob as Blob);return 'blob:card';};
    URL.revokeObjectURL = url => {revoked.push(url);};
    await assert.rejects(renderCardToBlob(container), /Canvas is unavailable/);
    assert.equal(source.removed,false);
    assert.equal(clone!.removed,true);
    assert.equal(clone!.attrs.get('width'),'320');
    assert.deepEqual(revoked,['blob:card']);
    abort = new AbortController();
    await assert.rejects(renderCardToBlob(container,abort.signal), {name:'AbortError'});
    assert.equal(created.length,2);
    abort = new AbortController();
    let readerAborted = false;
    Object.assign(globalThis, {
      fetch: async () => ({ok:true,blob:async()=>new Blob(['image'])}),
      FileReader: class extends EventTarget {
        readAsDataURL() { queueMicrotask(()=>abort!.abort()); }
        abort() { readerAborted = true; this.dispatchEvent(new Event('loadend')); }
      },
    });
    await assert.rejects(renderCardToBlob(container, abort.signal), {name:'AbortError'});
    assert.equal(readerAborted, true);
    assert.deepEqual(revoked,['blob:card','blob:card']);
  } finally {
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
    for (const key of ['SVGElement','Image','fetch','XMLSerializer','document','FileReader']) {
      if (Object.hasOwn(original,key)) Object.defineProperty(globalThis,key,original[key]!);
      else Reflect.deleteProperty(globalThis,key);
    }
  }
});

test('native share fallback rasterizes once, downloads the same PNG at 960 by 1530', async () => {
  const React = await import('react');
  const {act,create} = await import('react-test-renderer');
  const {ShareableCardModal} = await import('../src/components/ShareableCardModal');
  const descriptors = Object.getOwnPropertyDescriptors(globalThis);
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  let suspendImage = false;
  let rasterizations = 0;
  let downloads = 0;
  let shares = 0;
  let shareError: Error | undefined;
  let supported = false;
  let canvasAvailable = true;
  let exportAvailable = true;
  const canvas = {width:0,height:0,getContext:()=>canvasAvailable ? ({scale(){},drawImage(){rasterizations++;}}) : null,toBlob(callback:(blob:Blob | null)=>void){callback(exportAvailable ? new Blob(['png'],{type:'image/png'}) : null);}};
  class Svg {
    viewBox = {baseVal:{width:320,height:510}};
    cloneNode(){return new Svg();}
    querySelectorAll(){return [];}
    setAttribute(){}
  }
  class FakeImage extends EventTarget {
    set src(_value:string){if (!suspendImage) queueMicrotask(()=>this.dispatchEvent(new Event('load')));}
  }
  let view: ReturnType<typeof create> | undefined;
  const oldSetTimeout = setTimeout;
  const oldClearTimeout = clearTimeout;
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;
  let clearedCopiedTimer = false;
  try {
    Object.defineProperties(globalThis, {
      location:{configurable:true,value:{origin:'https://example.test',pathname:'/dashboard'}},
      navigator:{configurable:true,value:{share:async()=>{shares++;if(shareError) throw shareError;},canShare:()=>supported,clipboard:{writeText:async()=>{}}}},
      document:{configurable:true,value:{createElement:(tag:string)=>tag==='canvas'?canvas:{click(){downloads++;}}}},
      SVGElement:{configurable:true,value:Svg}, Image:{configurable:true,value:FakeImage},
      XMLSerializer:{configurable:true,value:class {serializeToString(){return '<svg/>';}}},
    });
    URL.createObjectURL = ()=>'blob:card';
    URL.revokeObjectURL = ()=>{};
    const account = {username:'Player',position:'ST',ranking:{tier:'GOLD',ranked:true,score:82},awards:[],championships:[],cardStats:[]} as never;
    act(()=>{view=create(React.createElement(ShareableCardModal,{account,onClose(){}}),{
      createNodeMock:element=>element.props.className?.includes('flip-card') ? {querySelector:()=>new Svg()} : null,
    });});
    const share = view!.root.findAllByType('button')[0]!;
    await act(async()=>{await share.props.onClick();});
    assert.equal(rasterizations,1);
    assert.equal(downloads,1);
    assert.deepEqual([canvas.width,canvas.height],[960,1530]);
    supported = true;
    await act(async()=>{await share.props.onClick();});
    assert.equal(shares, 1);
    assert.equal(downloads, 1);
    assert.equal(share.props.disabled, false);
    shareError = new DOMException('cancelled', 'AbortError');
    await act(async()=>{await share.props.onClick();});
    assert.equal(share.props.disabled, false);
    assert.doesNotMatch(JSON.stringify(view!.toJSON()), /Could not share/);
    canvasAvailable = false;
    await act(async()=>{await view!.root.findAllByType('button')[1]!.props.onClick();});
    assert.equal(share.props.disabled, false);
    assert.match(JSON.stringify(view!.toJSON()), /Canvas is unavailable/);
    canvasAvailable = true;
    exportAvailable = false;
    await act(async()=>{await view!.root.findAllByType('button')[1]!.props.onClick();});
    assert.equal(share.props.disabled, false);
    assert.match(JSON.stringify(view!.toJSON()), /Export failed/);
    exportAvailable = true;
    Object.defineProperties(globalThis, {
      setTimeout: {configurable:true,value: ((callback: (...args: unknown[]) => void, delay?: number) => {
        const timer = oldSetTimeout(callback, delay);
        if (delay === 2000) copiedTimer = timer;
        return timer;
      }) as typeof setTimeout},
      clearTimeout: {configurable:true,value: ((timer: ReturnType<typeof setTimeout>) => {
        if (timer === copiedTimer && timer !== undefined) clearedCopiedTimer = true;
        oldClearTimeout(timer);
      }) as typeof clearTimeout},
    });
    await act(async()=>{await view!.root.findAllByType('button')[2]!.props.onClick();});
    assert.ok(copiedTimer);
    assert.match(JSON.stringify(view!.toJSON()), /COPIED/);
    const drawsBeforeClose = rasterizations;
    suspendImage = true;
    let pending: Promise<void>;
    act(() => { pending = share.props.onClick(); });
    await act(async () => { await Promise.resolve(); });
    assert.equal(view!.root.findAllByType('button')[0]!.props.disabled, true);
    act(() => view!.root.findAllByType('button').at(-1)!.props.onClick());
    await act(async () => { await pending!; });
    assert.equal(rasterizations, drawsBeforeClose);
    assert.equal(downloads, 1);

  } finally {
    if(view) act(()=>view!.unmount());
    assert.equal(clearedCopiedTimer, true);
    Object.defineProperties(globalThis, {
      setTimeout: {configurable:true,value:oldSetTimeout},
      clearTimeout: {configurable:true,value:oldClearTimeout},
    });
    URL.createObjectURL=oldCreate;
    URL.revokeObjectURL=oldRevoke;
    for(const key of ['navigator','document','SVGElement','Image','XMLSerializer','location']) {
      if(Object.hasOwn(descriptors,key)) Object.defineProperty(globalThis,key,descriptors[key]!);
      else Reflect.deleteProperty(globalThis,key);
    }
  }
});
