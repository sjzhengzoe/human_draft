import useClipboard from "vue-clipboard3";
// 复制
export const copyLink = async (content: string) => {
  const { toClipboard } = useClipboard();
  await toClipboard(content);
};

// 下载
export const downloadBlob = (blob: Blob, fileName: string) => {
  // 创建一个临时的URL对象
  let url = URL.createObjectURL(blob);

  // 创建一个隐藏的<a>元素
  let a = document.createElement("a");
  a.style.display = "none";
  a.href = url;
  a.download = fileName;

  // 将<a>元素添加到DOM中
  document.body.appendChild(a);

  // 模拟点击<a>元素来触发下载
  a.click();

  // 清理临时的URL对象和<a>元素
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
};

// 将图片 URL 转换为 base64，用于 Safari 兼容性
export const imageToBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // 不设置 crossOrigin，避免 CORS 问题（本地资源不需要）
    // img.crossOrigin = "anonymous";

    // 设置超时，避免无限等待
    const timeout = setTimeout(() => {
      reject(new Error(`图片加载超时: ${url}`));
    }, 5000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("无法创建 canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        // 使用 PNG 格式以保持图片质量
        const base64 = canvas.toDataURL("image/png");
        resolve(base64);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`无法加载图片: ${url}`));
    };

    // 处理相对路径和 Vite 构建后的路径
    let finalUrl = url;
    if (
      !finalUrl.startsWith("http") &&
      !finalUrl.startsWith("/") &&
      !finalUrl.startsWith("data:")
    ) {
      // 尝试从当前页面解析
      try {
        finalUrl = new URL(finalUrl, window.location.href).href;
      } catch {
        // 如果解析失败，尝试作为绝对路径
        if (!finalUrl.startsWith("/")) {
          finalUrl = `/${finalUrl}`;
        }
      }
    }

    img.src = finalUrl;
  });
};

// 将 SVG 中的 CSS 变量替换为实际颜色值
export const replaceSVGCSSVariables = (element: HTMLElement): void => {
  const svgs = element.querySelectorAll("svg");
  svgs.forEach((svg) => {
    // 获取所有可能使用 CSS 变量的 SVG 元素
    const elements = svg.querySelectorAll(
      "path, circle, rect, ellipse, polygon, polyline, line, text, tspan"
    );
    elements.forEach((el) => {
      const svgEl = el as SVGElement;

      // 处理 fill 属性
      const computedFill = window.getComputedStyle(svgEl).fill;
      if (
        computedFill &&
        computedFill !== "none" &&
        computedFill !== "rgba(0, 0, 0, 0)"
      ) {
        // 如果当前属性是 CSS 变量，或者没有设置 fill 属性，则设置计算后的值
        const currentFill = svgEl.getAttribute("fill");
        if (!currentFill || currentFill.startsWith("var(")) {
          svgEl.setAttribute("fill", computedFill);
        }
      }

      // 处理 stroke 属性
      const computedStroke = window.getComputedStyle(svgEl).stroke;
      if (
        computedStroke &&
        computedStroke !== "none" &&
        computedStroke !== "rgba(0, 0, 0, 0)"
      ) {
        const currentStroke = svgEl.getAttribute("stroke");
        if (!currentStroke || currentStroke.startsWith("var(")) {
          svgEl.setAttribute("stroke", computedStroke);
        }
      }

      // 处理 stroke-width 属性
      const computedStrokeWidth = window.getComputedStyle(svgEl).strokeWidth;
      if (computedStrokeWidth && computedStrokeWidth !== "0px") {
        const currentStrokeWidth = svgEl.getAttribute("stroke-width");
        if (!currentStrokeWidth || currentStrokeWidth.startsWith("var(")) {
          svgEl.setAttribute("stroke-width", computedStrokeWidth);
        }
      }
    });
  });
};

// 将元素的所有背景图片转换为 base64 内联样式
export const convertBackgroundImagesToBase64 = async (
  element: HTMLElement
): Promise<void> => {
  const picBoxes = element.matches(".pic-box, .pic_box")
    ? [element]
    : Array.from(element.querySelectorAll(".pic-box, .pic_box"));
  const promises: Promise<void>[] = [];

  picBoxes.forEach((el) => {
    const htmlEl = el as HTMLElement;
    const computedStyle = window.getComputedStyle(htmlEl);
    const bgImage = computedStyle.backgroundImage;

    if (bgImage && bgImage !== "none" && bgImage !== "initial") {
      const urlMatch = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      if (urlMatch && urlMatch[1]) {
        let imageUrl = urlMatch[1];

        // 如果已经是 base64 格式，跳过转换
        if (imageUrl.startsWith("data:")) {
          return;
        }

        // 处理相对路径和 Vite 构建后的路径
        // Vite 构建后的路径通常是 /assets/xxx.jpg 格式
        if (
          imageUrl.startsWith("./") ||
          (!imageUrl.startsWith("http") &&
            !imageUrl.startsWith("/") &&
            !imageUrl.startsWith("data:"))
        ) {
          try {
            imageUrl = new URL(imageUrl, window.location.href).href;
          } catch {
            if (!imageUrl.startsWith("/")) {
              imageUrl = `/${imageUrl}`;
            }
          }
        }

        const promise = imageToBase64(imageUrl)
          .then((base64) => {
            // 获取其他背景属性
            const bgSize = computedStyle.backgroundSize || "cover";
            const bgPosition = computedStyle.backgroundPosition || "top";
            const bgRepeat = computedStyle.backgroundRepeat || "no-repeat";

            // 设置内联样式，使用 base64
            htmlEl.style.backgroundImage = `url(${base64})`;
            htmlEl.style.backgroundSize = bgSize;
            htmlEl.style.backgroundPosition = bgPosition;
            htmlEl.style.backgroundRepeat = bgRepeat;
          })
          .catch((error) => {
            console.warn("转换背景图片失败:", error, "原始 URL:", imageUrl);
            // 失败时保持原样
          });
        promises.push(promise);
      }
    }
  });

  await Promise.all(promises);
};
