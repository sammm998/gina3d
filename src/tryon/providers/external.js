/**
 * Mall för en extern virtual try-on-tjänst (t.ex. en diffusionsbaserad VTON-modell).
 *
 * Förväntat API (anpassa efter din tjänst):
 *   POST {endpoint}  multipart/form-data: person (image/png), garment (image/png),
 *                    productId, category
 *   Svar: image/png (resultatbild) eller JSON { imageUrl }
 *
 * OBS: Till skillnad från den lokala överlagringen skickar detta bilder till en
 * server. Gränssnittet visar det tydligt och kräver samtycke innan något skickas.
 * Använd aldrig hemliga API-nycklar i webbläsarkod – låt en egen backend sköta
 * autentiseringen mot tjänsten.
 */
function toBlob(source) {
  if (source instanceof Blob) return Promise.resolve(source);
  const canvas = document.createElement('canvas');
  canvas.width = source.width || source.naturalWidth;
  canvas.height = source.height || source.naturalHeight;
  canvas.getContext('2d').drawImage(source, 0, 0);
  return new Promise((res) => canvas.toBlob(res, 'image/png'));
}

export function createExternalProvider({ endpoint, name = 'Extern provning', headers = {} }) {
  return {
    id: 'external',
    name,
    realtime: false,
    sendsImagesToServer: true,
    description: `Skickar bilden till ${new URL(endpoint, window.location.href).host} för en mer realistisk provning.`,
    async render({ person, product, garmentImage }) {
      const form = new FormData();
      form.append('person', await toBlob(person), 'person.png');
      form.append('garment', await toBlob(garmentImage), 'garment.png');
      form.append('productId', product.id);
      form.append('category', product.category);
      const res = await fetch(endpoint, { method: 'POST', body: form, headers });
      if (!res.ok) throw new Error(`Tjänsten svarade ${res.status}`);
      const type = res.headers.get('content-type') || '';
      if (type.startsWith('image/')) return { image: await res.blob() };
      const json = await res.json();
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = json.imageUrl;
      await img.decode();
      return { image: img, note: json.note };
    },
  };
}
