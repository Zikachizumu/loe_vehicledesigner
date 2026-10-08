using SharpDX;

namespace LoeVdPack;

// Doğrulama görselleri için küçük yazılım rasterizer'ı (şablon PNG ve araç önizlemeleri).
static class Raster
{
    static void Blend(byte[] img, int i, byte r, byte g, byte b, byte a)
    {
        int ia = 255 - a;
        img[i] = (byte)((r * a + img[i] * ia) / 255);
        img[i + 1] = (byte)((g * a + img[i + 1] * ia) / 255);
        img[i + 2] = (byte)((b * a + img[i + 2] * ia) / 255);
        img[i + 3] = (byte)Math.Min(255, img[i + 3] + a * (255 - img[i + 3]) / 255 + 0);
    }

    public static void FillUvTri(byte[] img, int px, Vector2 a, Vector2 b, Vector2 c, byte r, byte g, byte bl, byte al)
    {
        float ax = a.X * px, ay = a.Y * px, bx = b.X * px, by = b.Y * px, cx = c.X * px, cy = c.Y * px;
        int x0 = Math.Max(0, (int)Math.Floor(Math.Min(ax, Math.Min(bx, cx)))), x1 = Math.Min(px - 1, (int)Math.Ceiling(Math.Max(ax, Math.Max(bx, cx))));
        int y0 = Math.Max(0, (int)Math.Floor(Math.Min(ay, Math.Min(by, cy)))), y1 = Math.Min(px - 1, (int)Math.Ceiling(Math.Max(ay, Math.Max(by, cy))));
        float area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.Abs(area) < 1e-6f) return;
        for (int y = y0; y <= y1; y++)
            for (int x = x0; x <= x1; x++)
            {
                float pxc = x + 0.5f, pyc = y + 0.5f;
                float w0 = ((bx - pxc) * (cy - pyc) - (by - pyc) * (cx - pxc)) / area;
                float w1 = ((cx - pxc) * (ay - pyc) - (cy - pyc) * (ax - pxc)) / area;
                float w2 = 1 - w0 - w1;
                if (w0 < -0.001f || w1 < -0.001f || w2 < -0.001f) continue;
                int i = (y * px + x) * 4;
                if (img[i + 3] >= al) continue; // aynı pikseli tekrar koyulaştırma
                img[i] = r; img[i + 1] = g; img[i + 2] = bl; img[i + 3] = al;
            }
    }

    // Test dokusu: her yüzey farklı renk + 64 px dama + sol kenarda koyu, üst kenarda açık şerit (yön kontrolü)
    static (byte r, byte g, byte b) TestTex(List<Chart> charts, int size, Vector2 uv)
    {
        double px = uv.X * size, py = uv.Y * size;
        var cols = new Dictionary<string, (int, int, int)> { ["top"] = (60, 200, 255), ["left"] = (255, 70, 150), ["right"] = (90, 230, 120), ["front"] = (255, 190, 40), ["rear"] = (170, 110, 255) };
        foreach (var c in charts)
        {
            if (px < c.X - 2 || px > c.X + c.W + 2 || py < c.Y - 2 || py > c.Y + c.H + 2) continue;
            var (r, g, b) = cols[c.Id];
            double fx = (px - c.X) / Math.Max(1, c.W), fy = (py - c.Y) / Math.Max(1, c.H);
            bool chk = (((int)(px / 64) + (int)(py / 64)) & 1) == 0;
            double k = chk ? 1.0 : 0.78;
            if (fx < 0.08) k *= 0.35;           // tuvalin solu
            if (fy < 0.08) k = Math.Min(1.25, k * 1.35); // tuvalin üstü
            return ((byte)Math.Min(255, r * k), (byte)Math.Min(255, g * k), (byte)Math.Min(255, b * k));
        }
        return (255, 0, 255);
    }

    // view: kameranın baktığı yön (araç uzayı), up: ekran yukarısı
    public static byte[] Preview(VehicleMesh m, ShellResult r, int size, Vector3 view, Vector3 up, int W, int H)
    {
        view.Normalize();
        var right = Vector3.Normalize(Vector3.Cross(view, up));
        var u = Vector3.Cross(right, view);
        var light = Vector3.Normalize(-view + u * 0.6f + right * 0.3f);
        var center = (m.BBMin + m.BBMax) / 2f;
        float ext = (m.BBMax - m.BBMin).Length() / 2f * 1.08f;
        float scale = Math.Min(W, H) / (2 * ext);
        var img = new byte[W * H * 4];
        var zb = new float[W * H];
        for (int i = 0; i < zb.Length; i++) zb[i] = float.MaxValue;
        for (int i = 0; i < W * H; i++) { img[i * 4] = 24; img[i * 4 + 1] = 24; img[i * 4 + 2] = 30; img[i * 4 + 3] = 255; }

        (float x, float y, float z) Proj(Vector3 p)
        {
            var d = p - center;
            return (W / 2f + Vector3.Dot(d, right) * scale, H / 2f - Vector3.Dot(d, u) * scale, Vector3.Dot(d, view));
        }

        void Tri(Vector3 a, Vector3 b, Vector3 c, Func<float, float, float, (byte, byte, byte)> shade, float bias)
        {
            var A = Proj(a); var B = Proj(b); var C = Proj(c);
            float area = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x);
            if (Math.Abs(area) < 1e-6f) return;
            int x0 = Math.Max(0, (int)Math.Floor(Math.Min(A.x, Math.Min(B.x, C.x)))), x1 = Math.Min(W - 1, (int)Math.Ceiling(Math.Max(A.x, Math.Max(B.x, C.x))));
            int y0 = Math.Max(0, (int)Math.Floor(Math.Min(A.y, Math.Min(B.y, C.y)))), y1 = Math.Min(H - 1, (int)Math.Ceiling(Math.Max(A.y, Math.Max(B.y, C.y))));
            for (int y = y0; y <= y1; y++)
                for (int x = x0; x <= x1; x++)
                {
                    float px = x + 0.5f, py = y + 0.5f;
                    float w0 = ((B.x - px) * (C.y - py) - (B.y - py) * (C.x - px)) / area;
                    float w1 = ((C.x - px) * (A.y - py) - (C.y - py) * (A.x - px)) / area;
                    float w2 = 1 - w0 - w1;
                    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
                    float z = w0 * A.z + w1 * B.z + w2 * C.z - bias;
                    int i = y * W + x;
                    if (z >= zb[i]) continue;
                    zb[i] = z;
                    var (rr, gg, bb) = shade(w0, w1, w2);
                    img[i * 4] = rr; img[i * 4 + 1] = gg; img[i * 4 + 2] = bb;
                }
        }

        // araç (gri)
        for (int t = 0; t < m.Tris.Count; t++)
        {
            var tr = m.Tris[t];
            Vector3 a = m.P[tr[0]], b = m.P[tr[1]], c = m.P[tr[2]];
            var n = Vector3.Normalize(Vector3.Cross(b - a, c - a));
            float l = Math.Abs(Vector3.Dot(n, light)) * 0.75f + 0.2f;
            byte g = (byte)(m.TriPaint[t] ? 150 * l : 95 * l);
            Tri(a, b, c, (_, _, _) => (g, g, g), 0f);
        }
        // kaplama parçaları: kemik yerel → araç uzayına geri çevrilir (dönüşüm doğrulaması)
        foreach (var p in r.Parts)
        {
            var abs = p.BoneIndex < m.Abs.Length ? m.Abs[p.BoneIndex] : Matrix.Identity;
            for (int i = 0; i + 2 < p.I.Count; i += 3)
            {
                var va = p.V[p.I[i]]; var vb = p.V[p.I[i + 1]]; var vc = p.V[p.I[i + 2]];
                var a = Vector3.TransformCoordinate(va.P, abs); var b = Vector3.TransformCoordinate(vb.P, abs); var c = Vector3.TransformCoordinate(vc.P, abs);
                var n = Vector3.Normalize(Vector3.Cross(b - a, c - a));
                float l = Math.Abs(Vector3.Dot(n, light)) * 0.6f + 0.4f;
                Tri(a, b, c, (w0, w1, w2) =>
                {
                    var uv = va.UV * w0 + vb.UV * w1 + vc.UV * w2;
                    var (rr, gg, bb) = TestTex(r.Charts, size, uv);
                    return ((byte)(rr * l), (byte)(gg * l), (byte)(bb * l));
                }, 0.002f);
            }
        }
        return PackWriter.Png(W, H, img);
    }
}
