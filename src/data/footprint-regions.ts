export type FootprintCityDefinition = {
  code: string
  name: string
  fullName: string
}

export type FootprintProvinceDefinition = {
  code: string
  name: string
  fullName: string
  cities: FootprintCityDefinition[]
}

// 省份和城市均按汉语拼音排序。333 个地级行政区之外，直辖市、港澳台各作为一个城市级足迹。
export const FOOTPRINT_PROVINCES: FootprintProvinceDefinition[] = [
  {
    "code": "340000",
    "name": "安徽",
    "fullName": "安徽省",
    "cities": [
      {
        "code": "340800",
        "name": "安庆",
        "fullName": "安庆市"
      },
      {
        "code": "340300",
        "name": "蚌埠",
        "fullName": "蚌埠市"
      },
      {
        "code": "341600",
        "name": "亳州",
        "fullName": "亳州市"
      },
      {
        "code": "341700",
        "name": "池州",
        "fullName": "池州市"
      },
      {
        "code": "341100",
        "name": "滁州",
        "fullName": "滁州市"
      },
      {
        "code": "341200",
        "name": "阜阳",
        "fullName": "阜阳市"
      },
      {
        "code": "340100",
        "name": "合肥",
        "fullName": "合肥市"
      },
      {
        "code": "340600",
        "name": "淮北",
        "fullName": "淮北市"
      },
      {
        "code": "340400",
        "name": "淮南",
        "fullName": "淮南市"
      },
      {
        "code": "341000",
        "name": "黄山",
        "fullName": "黄山市"
      },
      {
        "code": "341500",
        "name": "六安",
        "fullName": "六安市"
      },
      {
        "code": "340500",
        "name": "马鞍山",
        "fullName": "马鞍山市"
      },
      {
        "code": "341300",
        "name": "宿州",
        "fullName": "宿州市"
      },
      {
        "code": "340700",
        "name": "铜陵",
        "fullName": "铜陵市"
      },
      {
        "code": "340200",
        "name": "芜湖",
        "fullName": "芜湖市"
      },
      {
        "code": "341800",
        "name": "宣城",
        "fullName": "宣城市"
      }
    ]
  },
  {
    "code": "820000",
    "name": "澳门",
    "fullName": "澳门特别行政区",
    "cities": [
      {
        "code": "820000",
        "name": "澳门",
        "fullName": "澳门"
      }
    ]
  },
  {
    "code": "110000",
    "name": "北京",
    "fullName": "北京市",
    "cities": [
      {
        "code": "110000",
        "name": "北京",
        "fullName": "北京"
      }
    ]
  },
  {
    "code": "500000",
    "name": "重庆",
    "fullName": "重庆市",
    "cities": [
      {
        "code": "500000",
        "name": "重庆",
        "fullName": "重庆"
      }
    ]
  },
  {
    "code": "350000",
    "name": "福建",
    "fullName": "福建省",
    "cities": [
      {
        "code": "350100",
        "name": "福州",
        "fullName": "福州市"
      },
      {
        "code": "350800",
        "name": "龙岩",
        "fullName": "龙岩市"
      },
      {
        "code": "350700",
        "name": "南平",
        "fullName": "南平市"
      },
      {
        "code": "350900",
        "name": "宁德",
        "fullName": "宁德市"
      },
      {
        "code": "350300",
        "name": "莆田",
        "fullName": "莆田市"
      },
      {
        "code": "350500",
        "name": "泉州",
        "fullName": "泉州市"
      },
      {
        "code": "350400",
        "name": "三明",
        "fullName": "三明市"
      },
      {
        "code": "350200",
        "name": "厦门",
        "fullName": "厦门市"
      },
      {
        "code": "350600",
        "name": "漳州",
        "fullName": "漳州市"
      }
    ]
  },
  {
    "code": "620000",
    "name": "甘肃",
    "fullName": "甘肃省",
    "cities": [
      {
        "code": "620400",
        "name": "白银",
        "fullName": "白银市"
      },
      {
        "code": "621100",
        "name": "定西",
        "fullName": "定西市"
      },
      {
        "code": "623000",
        "name": "甘南",
        "fullName": "甘南藏族自治州"
      },
      {
        "code": "620200",
        "name": "嘉峪关",
        "fullName": "嘉峪关市"
      },
      {
        "code": "620300",
        "name": "金昌",
        "fullName": "金昌市"
      },
      {
        "code": "620900",
        "name": "酒泉",
        "fullName": "酒泉市"
      },
      {
        "code": "620100",
        "name": "兰州",
        "fullName": "兰州市"
      },
      {
        "code": "622900",
        "name": "临夏",
        "fullName": "临夏回族自治州"
      },
      {
        "code": "621200",
        "name": "陇南",
        "fullName": "陇南市"
      },
      {
        "code": "620800",
        "name": "平凉",
        "fullName": "平凉市"
      },
      {
        "code": "621000",
        "name": "庆阳",
        "fullName": "庆阳市"
      },
      {
        "code": "620500",
        "name": "天水",
        "fullName": "天水市"
      },
      {
        "code": "620600",
        "name": "武威",
        "fullName": "武威市"
      },
      {
        "code": "620700",
        "name": "张掖",
        "fullName": "张掖市"
      }
    ]
  },
  {
    "code": "440000",
    "name": "广东",
    "fullName": "广东省",
    "cities": [
      {
        "code": "445100",
        "name": "潮州",
        "fullName": "潮州市"
      },
      {
        "code": "441900",
        "name": "东莞",
        "fullName": "东莞市"
      },
      {
        "code": "440600",
        "name": "佛山",
        "fullName": "佛山市"
      },
      {
        "code": "440100",
        "name": "广州",
        "fullName": "广州市"
      },
      {
        "code": "441600",
        "name": "河源",
        "fullName": "河源市"
      },
      {
        "code": "441300",
        "name": "惠州",
        "fullName": "惠州市"
      },
      {
        "code": "440700",
        "name": "江门",
        "fullName": "江门市"
      },
      {
        "code": "445200",
        "name": "揭阳",
        "fullName": "揭阳市"
      },
      {
        "code": "440900",
        "name": "茂名",
        "fullName": "茂名市"
      },
      {
        "code": "441400",
        "name": "梅州",
        "fullName": "梅州市"
      },
      {
        "code": "441800",
        "name": "清远",
        "fullName": "清远市"
      },
      {
        "code": "440500",
        "name": "汕头",
        "fullName": "汕头市"
      },
      {
        "code": "441500",
        "name": "汕尾",
        "fullName": "汕尾市"
      },
      {
        "code": "440200",
        "name": "韶关",
        "fullName": "韶关市"
      },
      {
        "code": "440300",
        "name": "深圳",
        "fullName": "深圳市"
      },
      {
        "code": "441700",
        "name": "阳江",
        "fullName": "阳江市"
      },
      {
        "code": "445300",
        "name": "云浮",
        "fullName": "云浮市"
      },
      {
        "code": "440800",
        "name": "湛江",
        "fullName": "湛江市"
      },
      {
        "code": "441200",
        "name": "肇庆",
        "fullName": "肇庆市"
      },
      {
        "code": "442000",
        "name": "中山",
        "fullName": "中山市"
      },
      {
        "code": "440400",
        "name": "珠海",
        "fullName": "珠海市"
      }
    ]
  },
  {
    "code": "450000",
    "name": "广西",
    "fullName": "广西壮族自治区",
    "cities": [
      {
        "code": "451000",
        "name": "百色",
        "fullName": "百色市"
      },
      {
        "code": "450500",
        "name": "北海",
        "fullName": "北海市"
      },
      {
        "code": "451400",
        "name": "崇左",
        "fullName": "崇左市"
      },
      {
        "code": "450600",
        "name": "防城港",
        "fullName": "防城港市"
      },
      {
        "code": "450800",
        "name": "贵港",
        "fullName": "贵港市"
      },
      {
        "code": "450300",
        "name": "桂林",
        "fullName": "桂林市"
      },
      {
        "code": "451200",
        "name": "河池",
        "fullName": "河池市"
      },
      {
        "code": "451100",
        "name": "贺州",
        "fullName": "贺州市"
      },
      {
        "code": "451300",
        "name": "来宾",
        "fullName": "来宾市"
      },
      {
        "code": "450200",
        "name": "柳州",
        "fullName": "柳州市"
      },
      {
        "code": "450100",
        "name": "南宁",
        "fullName": "南宁市"
      },
      {
        "code": "450700",
        "name": "钦州",
        "fullName": "钦州市"
      },
      {
        "code": "450400",
        "name": "梧州",
        "fullName": "梧州市"
      },
      {
        "code": "450900",
        "name": "玉林",
        "fullName": "玉林市"
      }
    ]
  },
  {
    "code": "520000",
    "name": "贵州",
    "fullName": "贵州省",
    "cities": [
      {
        "code": "520400",
        "name": "安顺",
        "fullName": "安顺市"
      },
      {
        "code": "520500",
        "name": "毕节",
        "fullName": "毕节市"
      },
      {
        "code": "520100",
        "name": "贵阳",
        "fullName": "贵阳市"
      },
      {
        "code": "520200",
        "name": "六盘水",
        "fullName": "六盘水市"
      },
      {
        "code": "522600",
        "name": "黔东南",
        "fullName": "黔东南苗族侗族自治州"
      },
      {
        "code": "522700",
        "name": "黔南",
        "fullName": "黔南布依族苗族自治州"
      },
      {
        "code": "522300",
        "name": "黔西南",
        "fullName": "黔西南布依族苗族自治州"
      },
      {
        "code": "520600",
        "name": "铜仁",
        "fullName": "铜仁市"
      },
      {
        "code": "520300",
        "name": "遵义",
        "fullName": "遵义市"
      }
    ]
  },
  {
    "code": "460000",
    "name": "海南",
    "fullName": "海南省",
    "cities": [
      {
        "code": "460400",
        "name": "儋州",
        "fullName": "儋州市"
      },
      {
        "code": "460100",
        "name": "海口",
        "fullName": "海口市"
      },
      {
        "code": "460300",
        "name": "三沙",
        "fullName": "三沙市"
      },
      {
        "code": "460200",
        "name": "三亚",
        "fullName": "三亚市"
      }
    ]
  },
  {
    "code": "130000",
    "name": "河北",
    "fullName": "河北省",
    "cities": [
      {
        "code": "130600",
        "name": "保定",
        "fullName": "保定市"
      },
      {
        "code": "130900",
        "name": "沧州",
        "fullName": "沧州市"
      },
      {
        "code": "130800",
        "name": "承德",
        "fullName": "承德市"
      },
      {
        "code": "130400",
        "name": "邯郸",
        "fullName": "邯郸市"
      },
      {
        "code": "131100",
        "name": "衡水",
        "fullName": "衡水市"
      },
      {
        "code": "131000",
        "name": "廊坊",
        "fullName": "廊坊市"
      },
      {
        "code": "130300",
        "name": "秦皇岛",
        "fullName": "秦皇岛市"
      },
      {
        "code": "130100",
        "name": "石家庄",
        "fullName": "石家庄市"
      },
      {
        "code": "130200",
        "name": "唐山",
        "fullName": "唐山市"
      },
      {
        "code": "130500",
        "name": "邢台",
        "fullName": "邢台市"
      },
      {
        "code": "130700",
        "name": "张家口",
        "fullName": "张家口市"
      }
    ]
  },
  {
    "code": "410000",
    "name": "河南",
    "fullName": "河南省",
    "cities": [
      {
        "code": "410500",
        "name": "安阳",
        "fullName": "安阳市"
      },
      {
        "code": "410600",
        "name": "鹤壁",
        "fullName": "鹤壁市"
      },
      {
        "code": "410800",
        "name": "焦作",
        "fullName": "焦作市"
      },
      {
        "code": "410200",
        "name": "开封",
        "fullName": "开封市"
      },
      {
        "code": "410300",
        "name": "洛阳",
        "fullName": "洛阳市"
      },
      {
        "code": "411100",
        "name": "漯河",
        "fullName": "漯河市"
      },
      {
        "code": "411300",
        "name": "南阳",
        "fullName": "南阳市"
      },
      {
        "code": "410400",
        "name": "平顶山",
        "fullName": "平顶山市"
      },
      {
        "code": "410900",
        "name": "濮阳",
        "fullName": "濮阳市"
      },
      {
        "code": "411200",
        "name": "三门峡",
        "fullName": "三门峡市"
      },
      {
        "code": "411400",
        "name": "商丘",
        "fullName": "商丘市"
      },
      {
        "code": "410700",
        "name": "新乡",
        "fullName": "新乡市"
      },
      {
        "code": "411500",
        "name": "信阳",
        "fullName": "信阳市"
      },
      {
        "code": "411000",
        "name": "许昌",
        "fullName": "许昌市"
      },
      {
        "code": "410100",
        "name": "郑州",
        "fullName": "郑州市"
      },
      {
        "code": "411600",
        "name": "周口",
        "fullName": "周口市"
      },
      {
        "code": "411700",
        "name": "驻马店",
        "fullName": "驻马店市"
      }
    ]
  },
  {
    "code": "230000",
    "name": "黑龙江",
    "fullName": "黑龙江省",
    "cities": [
      {
        "code": "230600",
        "name": "大庆",
        "fullName": "大庆市"
      },
      {
        "code": "232700",
        "name": "大兴安岭",
        "fullName": "大兴安岭地区"
      },
      {
        "code": "230100",
        "name": "哈尔滨",
        "fullName": "哈尔滨市"
      },
      {
        "code": "230400",
        "name": "鹤岗",
        "fullName": "鹤岗市"
      },
      {
        "code": "231100",
        "name": "黑河",
        "fullName": "黑河市"
      },
      {
        "code": "230300",
        "name": "鸡西",
        "fullName": "鸡西市"
      },
      {
        "code": "230800",
        "name": "佳木斯",
        "fullName": "佳木斯市"
      },
      {
        "code": "231000",
        "name": "牡丹江",
        "fullName": "牡丹江市"
      },
      {
        "code": "230900",
        "name": "七台河",
        "fullName": "七台河市"
      },
      {
        "code": "230200",
        "name": "齐齐哈尔",
        "fullName": "齐齐哈尔市"
      },
      {
        "code": "230500",
        "name": "双鸭山",
        "fullName": "双鸭山市"
      },
      {
        "code": "231200",
        "name": "绥化",
        "fullName": "绥化市"
      },
      {
        "code": "230700",
        "name": "伊春",
        "fullName": "伊春市"
      }
    ]
  },
  {
    "code": "420000",
    "name": "湖北",
    "fullName": "湖北省",
    "cities": [
      {
        "code": "420700",
        "name": "鄂州",
        "fullName": "鄂州市"
      },
      {
        "code": "422800",
        "name": "恩施",
        "fullName": "恩施土家族苗族自治州"
      },
      {
        "code": "421100",
        "name": "黄冈",
        "fullName": "黄冈市"
      },
      {
        "code": "420200",
        "name": "黄石",
        "fullName": "黄石市"
      },
      {
        "code": "420800",
        "name": "荆门",
        "fullName": "荆门市"
      },
      {
        "code": "421000",
        "name": "荆州",
        "fullName": "荆州市"
      },
      {
        "code": "420300",
        "name": "十堰",
        "fullName": "十堰市"
      },
      {
        "code": "421300",
        "name": "随州",
        "fullName": "随州市"
      },
      {
        "code": "420100",
        "name": "武汉",
        "fullName": "武汉市"
      },
      {
        "code": "421200",
        "name": "咸宁",
        "fullName": "咸宁市"
      },
      {
        "code": "420600",
        "name": "襄阳",
        "fullName": "襄阳市"
      },
      {
        "code": "420900",
        "name": "孝感",
        "fullName": "孝感市"
      },
      {
        "code": "420500",
        "name": "宜昌",
        "fullName": "宜昌市"
      }
    ]
  },
  {
    "code": "430000",
    "name": "湖南",
    "fullName": "湖南省",
    "cities": [
      {
        "code": "430700",
        "name": "常德",
        "fullName": "常德市"
      },
      {
        "code": "431000",
        "name": "郴州",
        "fullName": "郴州市"
      },
      {
        "code": "430400",
        "name": "衡阳",
        "fullName": "衡阳市"
      },
      {
        "code": "431200",
        "name": "怀化",
        "fullName": "怀化市"
      },
      {
        "code": "431300",
        "name": "娄底",
        "fullName": "娄底市"
      },
      {
        "code": "430500",
        "name": "邵阳",
        "fullName": "邵阳市"
      },
      {
        "code": "430300",
        "name": "湘潭",
        "fullName": "湘潭市"
      },
      {
        "code": "433100",
        "name": "湘西",
        "fullName": "湘西土家族苗族自治州"
      },
      {
        "code": "430900",
        "name": "益阳",
        "fullName": "益阳市"
      },
      {
        "code": "431100",
        "name": "永州",
        "fullName": "永州市"
      },
      {
        "code": "430600",
        "name": "岳阳",
        "fullName": "岳阳市"
      },
      {
        "code": "430800",
        "name": "张家界",
        "fullName": "张家界市"
      },
      {
        "code": "430100",
        "name": "长沙",
        "fullName": "长沙市"
      },
      {
        "code": "430200",
        "name": "株洲",
        "fullName": "株洲市"
      }
    ]
  },
  {
    "code": "220000",
    "name": "吉林",
    "fullName": "吉林省",
    "cities": [
      {
        "code": "220800",
        "name": "白城",
        "fullName": "白城市"
      },
      {
        "code": "220600",
        "name": "白山",
        "fullName": "白山市"
      },
      {
        "code": "220200",
        "name": "吉林",
        "fullName": "吉林市"
      },
      {
        "code": "220400",
        "name": "辽源",
        "fullName": "辽源市"
      },
      {
        "code": "220300",
        "name": "四平",
        "fullName": "四平市"
      },
      {
        "code": "220700",
        "name": "松原",
        "fullName": "松原市"
      },
      {
        "code": "220500",
        "name": "通化",
        "fullName": "通化市"
      },
      {
        "code": "222400",
        "name": "延边",
        "fullName": "延边朝鲜族自治州"
      },
      {
        "code": "220100",
        "name": "长春",
        "fullName": "长春市"
      }
    ]
  },
  {
    "code": "320000",
    "name": "江苏",
    "fullName": "江苏省",
    "cities": [
      {
        "code": "320400",
        "name": "常州",
        "fullName": "常州市"
      },
      {
        "code": "320800",
        "name": "淮安",
        "fullName": "淮安市"
      },
      {
        "code": "320700",
        "name": "连云港",
        "fullName": "连云港市"
      },
      {
        "code": "320100",
        "name": "南京",
        "fullName": "南京市"
      },
      {
        "code": "320600",
        "name": "南通",
        "fullName": "南通市"
      },
      {
        "code": "320500",
        "name": "苏州",
        "fullName": "苏州市"
      },
      {
        "code": "321300",
        "name": "宿迁",
        "fullName": "宿迁市"
      },
      {
        "code": "321200",
        "name": "泰州",
        "fullName": "泰州市"
      },
      {
        "code": "320200",
        "name": "无锡",
        "fullName": "无锡市"
      },
      {
        "code": "320300",
        "name": "徐州",
        "fullName": "徐州市"
      },
      {
        "code": "320900",
        "name": "盐城",
        "fullName": "盐城市"
      },
      {
        "code": "321000",
        "name": "扬州",
        "fullName": "扬州市"
      },
      {
        "code": "321100",
        "name": "镇江",
        "fullName": "镇江市"
      }
    ]
  },
  {
    "code": "360000",
    "name": "江西",
    "fullName": "江西省",
    "cities": [
      {
        "code": "361000",
        "name": "抚州",
        "fullName": "抚州市"
      },
      {
        "code": "360700",
        "name": "赣州",
        "fullName": "赣州市"
      },
      {
        "code": "360800",
        "name": "吉安",
        "fullName": "吉安市"
      },
      {
        "code": "360200",
        "name": "景德镇",
        "fullName": "景德镇市"
      },
      {
        "code": "360400",
        "name": "九江",
        "fullName": "九江市"
      },
      {
        "code": "360100",
        "name": "南昌",
        "fullName": "南昌市"
      },
      {
        "code": "360300",
        "name": "萍乡",
        "fullName": "萍乡市"
      },
      {
        "code": "361100",
        "name": "上饶",
        "fullName": "上饶市"
      },
      {
        "code": "360500",
        "name": "新余",
        "fullName": "新余市"
      },
      {
        "code": "360900",
        "name": "宜春",
        "fullName": "宜春市"
      },
      {
        "code": "360600",
        "name": "鹰潭",
        "fullName": "鹰潭市"
      }
    ]
  },
  {
    "code": "210000",
    "name": "辽宁",
    "fullName": "辽宁省",
    "cities": [
      {
        "code": "210300",
        "name": "鞍山",
        "fullName": "鞍山市"
      },
      {
        "code": "210500",
        "name": "本溪",
        "fullName": "本溪市"
      },
      {
        "code": "211300",
        "name": "朝阳",
        "fullName": "朝阳市"
      },
      {
        "code": "210200",
        "name": "大连",
        "fullName": "大连市"
      },
      {
        "code": "210600",
        "name": "丹东",
        "fullName": "丹东市"
      },
      {
        "code": "210400",
        "name": "抚顺",
        "fullName": "抚顺市"
      },
      {
        "code": "210900",
        "name": "阜新",
        "fullName": "阜新市"
      },
      {
        "code": "211400",
        "name": "葫芦岛",
        "fullName": "葫芦岛市"
      },
      {
        "code": "210700",
        "name": "锦州",
        "fullName": "锦州市"
      },
      {
        "code": "211000",
        "name": "辽阳",
        "fullName": "辽阳市"
      },
      {
        "code": "211100",
        "name": "盘锦",
        "fullName": "盘锦市"
      },
      {
        "code": "210100",
        "name": "沈阳",
        "fullName": "沈阳市"
      },
      {
        "code": "211200",
        "name": "铁岭",
        "fullName": "铁岭市"
      },
      {
        "code": "210800",
        "name": "营口",
        "fullName": "营口市"
      }
    ]
  },
  {
    "code": "150000",
    "name": "内蒙古",
    "fullName": "内蒙古自治区",
    "cities": [
      {
        "code": "152900",
        "name": "阿拉善",
        "fullName": "阿拉善盟"
      },
      {
        "code": "150800",
        "name": "巴彦淖尔",
        "fullName": "巴彦淖尔市"
      },
      {
        "code": "150200",
        "name": "包头",
        "fullName": "包头市"
      },
      {
        "code": "150400",
        "name": "赤峰",
        "fullName": "赤峰市"
      },
      {
        "code": "150600",
        "name": "鄂尔多斯",
        "fullName": "鄂尔多斯市"
      },
      {
        "code": "150100",
        "name": "呼和浩特",
        "fullName": "呼和浩特市"
      },
      {
        "code": "150700",
        "name": "呼伦贝尔",
        "fullName": "呼伦贝尔市"
      },
      {
        "code": "150500",
        "name": "通辽",
        "fullName": "通辽市"
      },
      {
        "code": "150300",
        "name": "乌海",
        "fullName": "乌海市"
      },
      {
        "code": "150900",
        "name": "乌兰察布",
        "fullName": "乌兰察布市"
      },
      {
        "code": "152500",
        "name": "锡林郭勒",
        "fullName": "锡林郭勒盟"
      },
      {
        "code": "152200",
        "name": "兴安",
        "fullName": "兴安盟"
      }
    ]
  },
  {
    "code": "640000",
    "name": "宁夏",
    "fullName": "宁夏回族自治区",
    "cities": [
      {
        "code": "640400",
        "name": "固原",
        "fullName": "固原市"
      },
      {
        "code": "640200",
        "name": "石嘴山",
        "fullName": "石嘴山市"
      },
      {
        "code": "640300",
        "name": "吴忠",
        "fullName": "吴忠市"
      },
      {
        "code": "640100",
        "name": "银川",
        "fullName": "银川市"
      },
      {
        "code": "640500",
        "name": "中卫",
        "fullName": "中卫市"
      }
    ]
  },
  {
    "code": "630000",
    "name": "青海",
    "fullName": "青海省",
    "cities": [
      {
        "code": "632600",
        "name": "果洛",
        "fullName": "果洛藏族自治州"
      },
      {
        "code": "632200",
        "name": "海北",
        "fullName": "海北藏族自治州"
      },
      {
        "code": "630200",
        "name": "海东",
        "fullName": "海东市"
      },
      {
        "code": "632500",
        "name": "海南",
        "fullName": "海南藏族自治州"
      },
      {
        "code": "632800",
        "name": "海西",
        "fullName": "海西蒙古族藏族自治州"
      },
      {
        "code": "632300",
        "name": "黄南",
        "fullName": "黄南藏族自治州"
      },
      {
        "code": "630100",
        "name": "西宁",
        "fullName": "西宁市"
      },
      {
        "code": "632700",
        "name": "玉树",
        "fullName": "玉树藏族自治州"
      }
    ]
  },
  {
    "code": "370000",
    "name": "山东",
    "fullName": "山东省",
    "cities": [
      {
        "code": "371600",
        "name": "滨州",
        "fullName": "滨州市"
      },
      {
        "code": "371400",
        "name": "德州",
        "fullName": "德州市"
      },
      {
        "code": "370500",
        "name": "东营",
        "fullName": "东营市"
      },
      {
        "code": "371700",
        "name": "菏泽",
        "fullName": "菏泽市"
      },
      {
        "code": "370100",
        "name": "济南",
        "fullName": "济南市"
      },
      {
        "code": "370800",
        "name": "济宁",
        "fullName": "济宁市"
      },
      {
        "code": "371500",
        "name": "聊城",
        "fullName": "聊城市"
      },
      {
        "code": "371300",
        "name": "临沂",
        "fullName": "临沂市"
      },
      {
        "code": "370200",
        "name": "青岛",
        "fullName": "青岛市"
      },
      {
        "code": "371100",
        "name": "日照",
        "fullName": "日照市"
      },
      {
        "code": "370900",
        "name": "泰安",
        "fullName": "泰安市"
      },
      {
        "code": "371000",
        "name": "威海",
        "fullName": "威海市"
      },
      {
        "code": "370700",
        "name": "潍坊",
        "fullName": "潍坊市"
      },
      {
        "code": "370600",
        "name": "烟台",
        "fullName": "烟台市"
      },
      {
        "code": "370400",
        "name": "枣庄",
        "fullName": "枣庄市"
      },
      {
        "code": "370300",
        "name": "淄博",
        "fullName": "淄博市"
      }
    ]
  },
  {
    "code": "140000",
    "name": "山西",
    "fullName": "山西省",
    "cities": [
      {
        "code": "140200",
        "name": "大同",
        "fullName": "大同市"
      },
      {
        "code": "140500",
        "name": "晋城",
        "fullName": "晋城市"
      },
      {
        "code": "140700",
        "name": "晋中",
        "fullName": "晋中市"
      },
      {
        "code": "141000",
        "name": "临汾",
        "fullName": "临汾市"
      },
      {
        "code": "141100",
        "name": "吕梁",
        "fullName": "吕梁市"
      },
      {
        "code": "140600",
        "name": "朔州",
        "fullName": "朔州市"
      },
      {
        "code": "140100",
        "name": "太原",
        "fullName": "太原市"
      },
      {
        "code": "140900",
        "name": "忻州",
        "fullName": "忻州市"
      },
      {
        "code": "140300",
        "name": "阳泉",
        "fullName": "阳泉市"
      },
      {
        "code": "140800",
        "name": "运城",
        "fullName": "运城市"
      },
      {
        "code": "140400",
        "name": "长治",
        "fullName": "长治市"
      }
    ]
  },
  {
    "code": "610000",
    "name": "陕西",
    "fullName": "陕西省",
    "cities": [
      {
        "code": "610900",
        "name": "安康",
        "fullName": "安康市"
      },
      {
        "code": "610300",
        "name": "宝鸡",
        "fullName": "宝鸡市"
      },
      {
        "code": "610700",
        "name": "汉中",
        "fullName": "汉中市"
      },
      {
        "code": "611000",
        "name": "商洛",
        "fullName": "商洛市"
      },
      {
        "code": "610200",
        "name": "铜川",
        "fullName": "铜川市"
      },
      {
        "code": "610500",
        "name": "渭南",
        "fullName": "渭南市"
      },
      {
        "code": "610100",
        "name": "西安",
        "fullName": "西安市"
      },
      {
        "code": "610400",
        "name": "咸阳",
        "fullName": "咸阳市"
      },
      {
        "code": "610600",
        "name": "延安",
        "fullName": "延安市"
      },
      {
        "code": "610800",
        "name": "榆林",
        "fullName": "榆林市"
      }
    ]
  },
  {
    "code": "310000",
    "name": "上海",
    "fullName": "上海市",
    "cities": [
      {
        "code": "310000",
        "name": "上海",
        "fullName": "上海"
      }
    ]
  },
  {
    "code": "510000",
    "name": "四川",
    "fullName": "四川省",
    "cities": [
      {
        "code": "513200",
        "name": "阿坝",
        "fullName": "阿坝藏族羌族自治州"
      },
      {
        "code": "511900",
        "name": "巴中",
        "fullName": "巴中市"
      },
      {
        "code": "510100",
        "name": "成都",
        "fullName": "成都市"
      },
      {
        "code": "511700",
        "name": "达州",
        "fullName": "达州市"
      },
      {
        "code": "510600",
        "name": "德阳",
        "fullName": "德阳市"
      },
      {
        "code": "513300",
        "name": "甘孜",
        "fullName": "甘孜藏族自治州"
      },
      {
        "code": "511600",
        "name": "广安",
        "fullName": "广安市"
      },
      {
        "code": "510800",
        "name": "广元",
        "fullName": "广元市"
      },
      {
        "code": "511100",
        "name": "乐山",
        "fullName": "乐山市"
      },
      {
        "code": "513400",
        "name": "凉山",
        "fullName": "凉山彝族自治州"
      },
      {
        "code": "510500",
        "name": "泸州",
        "fullName": "泸州市"
      },
      {
        "code": "511400",
        "name": "眉山",
        "fullName": "眉山市"
      },
      {
        "code": "510700",
        "name": "绵阳",
        "fullName": "绵阳市"
      },
      {
        "code": "511300",
        "name": "南充",
        "fullName": "南充市"
      },
      {
        "code": "511000",
        "name": "内江",
        "fullName": "内江市"
      },
      {
        "code": "510400",
        "name": "攀枝花",
        "fullName": "攀枝花市"
      },
      {
        "code": "510900",
        "name": "遂宁",
        "fullName": "遂宁市"
      },
      {
        "code": "511800",
        "name": "雅安",
        "fullName": "雅安市"
      },
      {
        "code": "511500",
        "name": "宜宾",
        "fullName": "宜宾市"
      },
      {
        "code": "512000",
        "name": "资阳",
        "fullName": "资阳市"
      },
      {
        "code": "510300",
        "name": "自贡",
        "fullName": "自贡市"
      }
    ]
  },
  {
    "code": "710000",
    "name": "台湾",
    "fullName": "台湾省",
    "cities": [
      {
        "code": "710000",
        "name": "台湾",
        "fullName": "台湾"
      }
    ]
  },
  {
    "code": "120000",
    "name": "天津",
    "fullName": "天津市",
    "cities": [
      {
        "code": "120000",
        "name": "天津",
        "fullName": "天津"
      }
    ]
  },
  {
    "code": "540000",
    "name": "西藏",
    "fullName": "西藏自治区",
    "cities": [
      {
        "code": "542500",
        "name": "阿里",
        "fullName": "阿里地区"
      },
      {
        "code": "540300",
        "name": "昌都",
        "fullName": "昌都市"
      },
      {
        "code": "540100",
        "name": "拉萨",
        "fullName": "拉萨市"
      },
      {
        "code": "540400",
        "name": "林芝",
        "fullName": "林芝市"
      },
      {
        "code": "540600",
        "name": "那曲",
        "fullName": "那曲市"
      },
      {
        "code": "540200",
        "name": "日喀则",
        "fullName": "日喀则市"
      },
      {
        "code": "540500",
        "name": "山南",
        "fullName": "山南市"
      }
    ]
  },
  {
    "code": "810000",
    "name": "香港",
    "fullName": "香港特别行政区",
    "cities": [
      {
        "code": "810000",
        "name": "香港",
        "fullName": "香港"
      }
    ]
  },
  {
    "code": "650000",
    "name": "新疆",
    "fullName": "新疆维吾尔自治区",
    "cities": [
      {
        "code": "652900",
        "name": "阿克苏",
        "fullName": "阿克苏地区"
      },
      {
        "code": "654300",
        "name": "阿勒泰",
        "fullName": "阿勒泰地区"
      },
      {
        "code": "652800",
        "name": "巴音郭楞蒙古",
        "fullName": "巴音郭楞蒙古自治州"
      },
      {
        "code": "652700",
        "name": "博尔塔拉蒙古",
        "fullName": "博尔塔拉蒙古自治州"
      },
      {
        "code": "652300",
        "name": "昌吉",
        "fullName": "昌吉回族自治州"
      },
      {
        "code": "650500",
        "name": "哈密",
        "fullName": "哈密市"
      },
      {
        "code": "653200",
        "name": "和田",
        "fullName": "和田地区"
      },
      {
        "code": "653100",
        "name": "喀什",
        "fullName": "喀什地区"
      },
      {
        "code": "650200",
        "name": "克拉玛依",
        "fullName": "克拉玛依市"
      },
      {
        "code": "653000",
        "name": "克孜勒苏",
        "fullName": "克孜勒苏柯尔克孜自治州"
      },
      {
        "code": "654200",
        "name": "塔城",
        "fullName": "塔城地区"
      },
      {
        "code": "650400",
        "name": "吐鲁番",
        "fullName": "吐鲁番市"
      },
      {
        "code": "650100",
        "name": "乌鲁木齐",
        "fullName": "乌鲁木齐市"
      },
      {
        "code": "654000",
        "name": "伊犁",
        "fullName": "伊犁哈萨克自治州"
      }
    ]
  },
  {
    "code": "530000",
    "name": "云南",
    "fullName": "云南省",
    "cities": [
      {
        "code": "530500",
        "name": "保山",
        "fullName": "保山市"
      },
      {
        "code": "532300",
        "name": "楚雄",
        "fullName": "楚雄彝族自治州"
      },
      {
        "code": "532900",
        "name": "大理",
        "fullName": "大理白族自治州"
      },
      {
        "code": "533100",
        "name": "德宏",
        "fullName": "德宏傣族景颇族自治州"
      },
      {
        "code": "533400",
        "name": "迪庆",
        "fullName": "迪庆藏族自治州"
      },
      {
        "code": "532500",
        "name": "红河",
        "fullName": "红河哈尼族彝族自治州"
      },
      {
        "code": "530100",
        "name": "昆明",
        "fullName": "昆明市"
      },
      {
        "code": "530700",
        "name": "丽江",
        "fullName": "丽江市"
      },
      {
        "code": "530900",
        "name": "临沧",
        "fullName": "临沧市"
      },
      {
        "code": "533300",
        "name": "怒江",
        "fullName": "怒江傈僳族自治州"
      },
      {
        "code": "530800",
        "name": "普洱",
        "fullName": "普洱市"
      },
      {
        "code": "530300",
        "name": "曲靖",
        "fullName": "曲靖市"
      },
      {
        "code": "532600",
        "name": "文山",
        "fullName": "文山壮族苗族自治州"
      },
      {
        "code": "532800",
        "name": "西双版纳",
        "fullName": "西双版纳傣族自治州"
      },
      {
        "code": "530400",
        "name": "玉溪",
        "fullName": "玉溪市"
      },
      {
        "code": "530600",
        "name": "昭通",
        "fullName": "昭通市"
      }
    ]
  },
  {
    "code": "330000",
    "name": "浙江",
    "fullName": "浙江省",
    "cities": [
      {
        "code": "330100",
        "name": "杭州",
        "fullName": "杭州市"
      },
      {
        "code": "330500",
        "name": "湖州",
        "fullName": "湖州市"
      },
      {
        "code": "330400",
        "name": "嘉兴",
        "fullName": "嘉兴市"
      },
      {
        "code": "330700",
        "name": "金华",
        "fullName": "金华市"
      },
      {
        "code": "331100",
        "name": "丽水",
        "fullName": "丽水市"
      },
      {
        "code": "330200",
        "name": "宁波",
        "fullName": "宁波市"
      },
      {
        "code": "330800",
        "name": "衢州",
        "fullName": "衢州市"
      },
      {
        "code": "330600",
        "name": "绍兴",
        "fullName": "绍兴市"
      },
      {
        "code": "331000",
        "name": "台州",
        "fullName": "台州市"
      },
      {
        "code": "330300",
        "name": "温州",
        "fullName": "温州市"
      },
      {
        "code": "330900",
        "name": "舟山",
        "fullName": "舟山市"
      }
    ]
  }
]

export const FOOTPRINT_TOTAL_PROVINCE_COUNT = FOOTPRINT_PROVINCES.length
export const FOOTPRINT_TOTAL_CITY_COUNT = 340
