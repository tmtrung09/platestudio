/* Complete presentation inventory; permissions and business commands stay in their owners. */
(() => {
  const native={
    dashboard:{family:'priorities',title:'Việc hôm nay'},
    models:{family:'catalog',title:'Model'},orders:{family:'catalog',title:'Đơn hàng'},
    plates:{family:'catalog',title:'Plate in'},projects:{family:'catalog',title:'Project'},
    filaments:{family:'materials',title:'Màu nhựa'},batches:{family:'gallery',title:'Báo cáo mẻ'},
    reminders:{family:'production',title:'Cần in'},inventory:{family:'production',title:'Cần in lại'},
    'print-plans':{family:'production',title:'Lịch máy'},'machine-setup':{family:'materials',title:'Khay nhựa'},
    'printer-monitor':{family:'machines',title:'Máy & mẻ in'},progress:{family:'progress',title:'Tiến độ'},
    fulfillment:{family:'workshop',title:'Gia công & giao hàng'},packaging:{family:'workshop',title:'Bao bì & nhãn'},
    'delivery-builder':{family:'delivery',title:'Tạo phiếu giao'},'delivery-receive':{family:'delivery',title:'Nhận hàng'},
    kiotviet:{family:'sales',title:'Đồng bộ KiotViet'},sales:{family:'sales',title:'Bán hàng'},
    'kiotviet-map':{family:'formula',title:'Ghép SKU'},'order-form':{family:'order',title:'Tạo / sửa đơn'},
    data:{family:'administration',title:'Dữ liệu'},devices:{family:'administration',title:'Thiết bị'},
    access:{family:'administration',title:'Phân quyền'}
  };
  const surfaces={
    'custom-orders':{family:'counter',title:'Nhận đơn custom'},
    'order-status':{family:'customer',title:'Theo dõi đơn'},
    authentication:{family:'identity',title:'Đăng nhập / tài khoản'},
    camera:{family:'capture',title:'Camera / ảnh chờ'},
    notifications:{family:'notifications',title:'Thông báo'},
    'workshop-swipe':{family:'focus',title:'Gia công bằng thẻ quẹt'},
    dialogs:{family:'task',title:'Tạo / sửa / chi tiết / bộ chọn'}
  };
  window.PlateMobileRoutes=Object.freeze({native:Object.freeze(native),surfaces:Object.freeze(surfaces)});
})();
