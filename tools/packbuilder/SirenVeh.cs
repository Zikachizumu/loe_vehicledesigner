using CodeWalker.GameFiles;
using SharpDX;
using System.Text;
using System.Text.Json;

namespace LoeVdPack;

// vdpack bones <yft>                       — iskelet (kemik) dökümü (geliştirme)
// vdpack sirenveh ...                      — siren kemiklerini ekleyip gen9 yft üretir (aşağıya bak)
static class SirenVeh
{
    public static int Bones(string[] a)
    {
        var yft = VehicleMesh.LoadYft(a[1]);
        var d = yft.Fragment.Drawable;
        var sk = d.Skeleton;
        Console.WriteLine($"kemik={sk.Bones.Items.Length} tags={sk.BoneTags?.data_items?.Length} child={sk.ChildIndices?.Length} fragBT={yft.Fragment.BoneTransforms?.Items?.Length} unk1C={sk.Unknown_1Ch.Value} u50={sk.Unknown_50h.Hash} u54={sk.Unknown_54h.Hash} u58={sk.Unknown_58h.Hash}");
        foreach (var b in sk.Bones.Items)
        {
            if (a.Length > 2 && !b.Name.Contains(a[2], StringComparison.OrdinalIgnoreCase)) continue;
            Console.WriteLine($"{b.Index,3} {b.Name,-22} tag={b.Tag,5} par={b.ParentIndex,3} sib={b.NextSiblingIndex,3} fl={b.Flags} T=({b.Translation.X:F4},{b.Translation.Y:F4},{b.Translation.Z:F4}) R=({b.Rotation.X:F3},{b.Rotation.Y:F3},{b.Rotation.Z:F3},{b.Rotation.W:F3}) S=({b.Scale.X:F2},{b.Scale.Y:F2},{b.Scale.Z:F2}) U={b.TransformUnk} u1C={b.Unknown_1Ch} u2C={b.Unknown_2Ch}" + (Bone.CalculateBoneHash(b.Name) != b.Tag ? " !hash=" + Bone.CalculateBoneHash(b.Name) : ""));
            var bt = yft.Fragment.BoneTransforms?.Items;
            if (bt != null && a.Length > 2 && b.Index < bt.Length) Console.WriteLine("      BT: " + string.Join(" ", bt[b.Index].ToArray().Select(v => v.ToString("F4"))));
        }
        return 0;
    }

    static string Arg(string[] a, string k)
    {
        for (int i = 0; i < a.Length - 1; i++) if (a[i] == k) return a[i + 1];
        return null;
    }

    // vdpack sirenveh --yft <girdi.yft> --json <ayar.json> --out <çıktı.yft>
    //   ayar.json: { "leds": [ { "n": 1, "x": 0.1, "y": 0.4, "z": 0.7 }, ... ] }   (n = siren<n> kemiği; konum araç uzayında, metre)
    // Araç yft'sine siren<n> kemiklerini ekler (ebeveyn: kök kemik) ve gen9 (Enhanced) yft olarak yazar.
    public static int Run(string[] a)
    {
        var inp = Arg(a, "--yft"); var cfg = Arg(a, "--json"); var outp = Arg(a, "--out");
        if (inp == null || cfg == null || outp == null) { Console.WriteLine("kullanım: sirenveh --yft in.yft --json ayar.json --out out.yft"); return 1; }
        var doc = JsonDocument.Parse(File.ReadAllText(cfg));
        var leds = doc.RootElement.GetProperty("leds").EnumerateArray()
            .Select(e => (n: e.GetProperty("n").GetInt32(), p: new Vector3(e.GetProperty("x").GetSingle(), e.GetProperty("y").GetSingle(), e.GetProperty("z").GetSingle()))).ToList();

        var yft = VehicleMesh.LoadYft(inp);
        var frag = yft.Fragment;
        var sk = frag.Drawable?.Skeleton ?? throw new Exception("iskelet yok");
        var bones = sk.Bones.Items.ToList();
        int root = bones.FindIndex(b => b.ParentIndex < 0);
        if (root < 0) root = 0;
        var rootT = bones[root].Translation;
        int first = bones.Count;
        int lastChain = bones.FindLastIndex(b => b.ParentIndex == root && b.NextSiblingIndex < 0);

        var added = new List<Bone>();
        foreach (var (n, p) in leds)
        {
            var name = "siren" + n;
            if (bones.Any(b => string.Equals(b.Name, name, StringComparison.OrdinalIgnoreCase))) throw new Exception(name + " kemiği zaten var");
            var b = new Bone
            {
                Name = name,
                Tag = Bone.CalculateBoneHash(name),
                Index = (short)(first + added.Count),
                Index2 = (short)(first + added.Count),
                ParentIndex = (short)root,
                NextSiblingIndex = -1,
                Flags = EBoneFlags.RotX | EBoneFlags.RotY | EBoneFlags.RotZ,
                Translation = p - rootT,
                Rotation = Quaternion.Identity,
                Scale = Vector3.One,
                TransformUnk = new Vector4(0, 4, -3, 0),
            };
            added.Add(b);
        }
        for (int i = 0; i < added.Count - 1; i++) added[i].NextSiblingIndex = added[i + 1].Index;
        if (added.Count > 0 && lastChain >= 0) bones[lastChain].NextSiblingIndex = added[0].Index;
        bones.AddRange(added);

        sk.Bones.Items = bones.ToArray();
        sk.Bones.Count = (uint)bones.Count;
        sk.BuildIndices();
        sk.BuildBoneTags();
        sk.AssignBoneParents();
        sk.BuildTransformations();
        sk.BuildBonesMap();

        // parçalanma / hasar dönüşüm dizisi kemik başına bir kayıt tutar (dinlenme pozunda birim matris)
        var bt = frag.BoneTransforms;
        if (bt?.Items != null && added.Count > 0)
        {
            var items = bt.Items.ToList();
            while (items.Count < bones.Count) items.Add(new Matrix3_s(null));
            bt.Items = items.ToArray();
            bt.ItemCount1 = bt.ItemCount2 = (byte)items.Count;
        }

        var prev = RpfManager.IsGen9;
        RpfManager.IsGen9 = true;
        byte[] data;
        try { data = yft.Save(); }
        finally { RpfManager.IsGen9 = prev; }
        File.WriteAllBytes(outp, data);
        Console.WriteLine($"{Path.GetFileName(outp)}: {sk.Bones.Items.Length} kemik (+{added.Count}), {data.Length} bayt");
        return 0;
    }

    // vdpack gen9file <girdi> <çıktı>   — gen8 ytd / ydr / yft dosyasını gen9'a (Enhanced) çevirir
    public static int Gen9File(string[] a)
    {
        var ext = Path.GetExtension(a[1]).ToLowerInvariant();
        var data = File.ReadAllBytes(a[1]);
        var bytes = PackWriter.Gen9(data, ext);
        File.WriteAllBytes(a[2], bytes);
        Console.WriteLine($"{Path.GetFileName(a[2])}: {bytes.Length} bayt");
        return 0;
    }

    // vdpack yft2xml <yft> <xml>   — karşılaştırma / hata ayıklama
    public static int Yft2Xml(string[] a)
    {
        var yft = VehicleMesh.LoadYft(a[1]);
        var prev = RpfManager.IsGen9;
        RpfManager.IsGen9 = BitConverter.ToInt32(File.ReadAllBytes(a[1]), 4) == 171;
        try { File.WriteAllText(a[2], YftXml.GetXml(yft)); }
        finally { RpfManager.IsGen9 = prev; }
        return 0;
    }
}
